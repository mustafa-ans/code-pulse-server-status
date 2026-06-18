import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

/**
 * Code Pulse
 * ----------
 * A self-contained Rust build-status indicator for the VS Code status bar.
 *
 * It does NOT depend on cargo-watch (archived) or any external watcher crate.
 * Instead it uses two things VS Code and cargo already give us for free:
 *   1. `vscode.workspace.onDidSaveTextDocument` as the file watcher.
 *   2. `cargo <cmd> --message-format=json-diagnostic-rendered-ansi`, whose
 *      machine-readable output is a stable, documented contract -- so build
 *      status comes from parsed JSON records, not fragile string-grepping of
 *      localized human text.
 */

type CodePulseCommand = 'check' | 'run';

const enum State {
	Idle,
	Building,
	Ok,       // `cargo check` succeeded
	Running,  // `cargo run` build succeeded; binary/server is up
	Exited,   // `cargo run` finished and the process exited cleanly
	Failed,
}

// A single cargo JSON record we care about. cargo emits one JSON object per
// line on stdout. See `cargo build --message-format=json`.
interface CargoMessage {
	reason: string;
	success?: boolean; // present on reason === 'build-finished'
	message?: {
		level?: string;
		rendered?: string;
	};
}

let statusBarItem: vscode.StatusBarItem;
let output: PtyTerminal | undefined;
let currentChild: ChildProcessWithoutNullStreams | undefined;
let saveDebounce: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
	statusBarItem = vscode.window.createStatusBarItem('codePulse.status', vscode.StatusBarAlignment.Right, -100);
	statusBarItem.name = 'Code Pulse';
	statusBarItem.command = 'codePulse.start';
	context.subscriptions.push(statusBarItem);
	setState(State.Idle);
	statusBarItem.show();

	context.subscriptions.push(
		vscode.commands.registerCommand('codePulse.start', () => start()),
		vscode.commands.registerCommand('codePulse.stop', () => stop(true)),
		vscode.commands.registerCommand('codePulse.showOutput', () => output?.reveal()),
		vscode.commands.registerCommand('codePulse.selectCommand', () => selectCommand()),
	);

	// Our "watcher": rebuild when a Rust source file is saved.
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (doc.languageId !== 'rust' && !doc.fileName.endsWith('.rs')) {
				return;
			}
			if (!getConfig().get<boolean>('runOnSave', true)) {
				return;
			}
			// Debounce bursts of saves (e.g. "save all").
			if (saveDebounce) {
				clearTimeout(saveDebounce);
			}
			saveDebounce = setTimeout(() => start(), 250);
		}),
	);

	context.subscriptions.push({ dispose: () => stop(false) });
}

export function deactivate(): void {
	stop(false);
}

function getConfig(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('codePulse');
}

/**
 * Quick-pick to switch the cargo command (check / run) without editing settings,
 * then rebuild with the new command.
 */
async function selectCommand(): Promise<void> {
	const current = getConfig().get<string>('command', 'run');
	const items: vscode.QuickPickItem[] = [
		{ label: 'run', description: 'cargo run — compile and launch the binary/server' },
		{ label: 'check', description: 'cargo check — faster, only verify it compiles' },
	];
	for (const item of items) {
		if (item.label === current) {
			item.description += '  (current)';
		}
	}
	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: `Code Pulse build command (currently: ${current})`,
	});
	if (!pick) {
		return;
	}
	const folder = vscode.workspace.workspaceFolders?.[0];
	const target = folder
		? vscode.ConfigurationTarget.Workspace
		: vscode.ConfigurationTarget.Global;
	await getConfig().update('command', pick.label, target);
	start();
}

function start(): void {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		vscode.window.showErrorMessage('Code Pulse: open a folder containing a Cargo project first.');
		return;
	}

	// Restart semantics: kill any in-flight build/server before starting a new one.
	stop(false);

	const config = getConfig();
	const command = (config.get<string>('command', 'run') as CodePulseCommand);
	const cargoPath = config.get<string>('cargoPath', 'cargo');
	const cwd = folder.uri.fsPath;

	const args = [command, '--message-format=json-diagnostic-rendered-ansi'];

	const term = ensureTerminal();
	term.writeLine(`\x1b[2m$ ${cargoPath} ${args.join(' ')}\x1b[0m`);

	setState(State.Building);

	let child: ChildProcessWithoutNullStreams;
	try {
		child = spawn(cargoPath, args, { cwd });
	} catch (err) {
		failSpawn(err);
		return;
	}
	currentChild = child;

	let buildSucceeded: boolean | undefined;
	let stdoutBuffer = '';

	child.stdout.on('data', (data: Buffer) => {
		stdoutBuffer += data.toString();
		let newlineIndex: number;
		while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
			const line = stdoutBuffer.slice(0, newlineIndex);
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
			handleStdoutLine(line, term, (success) => {
				buildSucceeded = success;
				setState(success ? (command === 'run' ? State.Running : State.Ok) : State.Failed);
				if (!success) {
					maybeRevealOnFailure(term);
				}
			});
		}
	});

	// cargo prints human-readable progress ("Compiling", "Finished", "Running",
	// "error: could not compile") to stderr -- write it straight through so the
	// terminal still looks like a normal cargo session.
	child.stderr.on('data', (data: Buffer) => term.write(data.toString()));

	child.on('error', (err) => failSpawn(err));

	child.on('close', (code) => {
		if (currentChild !== child) {
			return; // superseded by a newer run; ignore.
		}
		currentChild = undefined;
		// `cargo run` for a long-lived server only reaches here on exit.
		if (buildSucceeded === false || (code !== 0 && code !== null)) {
			setState(State.Failed);
			maybeRevealOnFailure(term);
		} else if (command === 'run') {
			// Server/program ended cleanly -> distinct "exited" state.
			setState(State.Exited);
		}
	});
}

function stop(showMessage: boolean): void {
	if (saveDebounce) {
		clearTimeout(saveDebounce);
		saveDebounce = undefined;
	}
	const child = currentChild;
	currentChild = undefined;
	if (child) {
		child.removeAllListeners();
		try {
			child.kill();
		} catch {
			/* already gone */
		}
		if (showMessage) {
			output?.writeLine('\x1b[2m-- stopped by user --\x1b[0m');
			setState(State.Idle);
		}
	} else if (showMessage) {
		setState(State.Idle);
	}
}

/**
 * Classify a single line of cargo stdout. Pure and free of side effects so it
 * can be unit-tested without VS Code. Lines that aren't a cargo record are
 * program output (from `cargo run`) and are passed through verbatim.
 */
export type ParsedCargoLine =
	| { kind: 'build-finished'; success: boolean }
	| { kind: 'compiler-message'; rendered: string }
	| { kind: 'passthrough'; text: string };

export function parseCargoLine(line: string): ParsedCargoLine | undefined {
	const trimmed = line.trim();
	if (trimmed === '') {
		return undefined;
	}

	let msg: CargoMessage | undefined;
	if (trimmed.startsWith('{')) {
		try {
			msg = JSON.parse(trimmed) as CargoMessage;
		} catch {
			msg = undefined;
		}
	}

	if (!msg || typeof msg.reason !== 'string') {
		// Not a cargo record -> program stdout from `cargo run`.
		return { kind: 'passthrough', text: line };
	}

	if (msg.reason === 'compiler-message' && msg.message?.rendered) {
		return { kind: 'compiler-message', rendered: msg.message.rendered };
	}
	if (msg.reason === 'build-finished') {
		return { kind: 'build-finished', success: msg.success === true };
	}
	return undefined; // a cargo record we don't act on
}

/**
 * Apply a parsed line: stream output to the terminal or report build status.
 */
function handleStdoutLine(
	line: string,
	term: PtyTerminal,
	onBuildFinished: (success: boolean) => void,
): void {
	const parsed = parseCargoLine(line);
	if (!parsed) {
		return;
	}
	switch (parsed.kind) {
		case 'passthrough':
			term.writeLine(parsed.text);
			break;
		case 'compiler-message':
			term.write(parsed.rendered);
			break;
		case 'build-finished':
			onBuildFinished(parsed.success);
			break;
	}
}

function failSpawn(err: unknown): void {
	const message = err instanceof Error ? err.message : String(err);
	setState(State.Failed);
	const hint = message.includes('ENOENT')
		? 'cargo was not found on your PATH. Install Rust (rustup) or set "codePulse.cargoPath".'
		: message;
	vscode.window.showErrorMessage(`Code Pulse: ${hint}`);
	output?.writeLine(`\x1b[31mError: ${hint}\x1b[0m`);
}

function maybeRevealOnFailure(term: PtyTerminal): void {
	if (getConfig().get<boolean>('revealTerminalOnFailure', true)) {
		term.reveal();
	}
}

function setState(state: State): void {
	statusBarItem.backgroundColor = undefined;
	switch (state) {
		case State.Idle:
			statusBarItem.text = '$(circle-outline) Code Pulse';
			statusBarItem.tooltip = 'Code Pulse: click to build the Rust project';
			break;
		case State.Building:
			statusBarItem.text = '$(sync~spin) Building…';
			statusBarItem.tooltip = 'Code Pulse: compiling…';
			break;
		case State.Ok:
			statusBarItem.text = '$(check) Build OK';
			statusBarItem.tooltip = 'Code Pulse: cargo check succeeded';
			break;
		case State.Running:
			statusBarItem.text = '$(pulse) Running';
			statusBarItem.tooltip = 'Code Pulse: build succeeded, server is running';
			break;
		case State.Exited:
			statusBarItem.text = '$(circle-slash) Exited';
			statusBarItem.tooltip = 'Code Pulse: process exited cleanly — click to run again';
			break;
		case State.Failed:
			statusBarItem.text = '$(error)';
			statusBarItem.tooltip = 'Code Pulse: build failed — click to rebuild';
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			break;
	}
}

function ensureTerminal(): PtyTerminal {
	if (!output) {
		output = new PtyTerminal();
	}
	return output;
}

/**
 * A reusable pseudo-terminal. One instance is kept for the lifetime of the
 * extension so repeated builds stream into the same "Code Pulse" terminal
 * instead of spawning a new one each time.
 */
class PtyTerminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	private terminal: vscode.Terminal | undefined;

	private create(): vscode.Terminal {
		const pty: vscode.Pseudoterminal = {
			onDidWrite: this.writeEmitter.event,
			open: () => { /* nothing to do */ },
			close: () => { /* keep emitter for reuse */ },
		};
		const terminal = vscode.window.createTerminal({ name: 'Code Pulse', pty });
		this.terminal = terminal;
		vscode.window.onDidCloseTerminal((closed) => {
			if (closed === this.terminal) {
				this.terminal = undefined;
			}
		});
		return terminal;
	}

	private ensure(): vscode.Terminal {
		return this.terminal ?? this.create();
	}

	write(text: string): void {
		this.ensure();
		this.writeEmitter.fire(text.replace(/\r?\n/g, '\r\n'));
	}

	writeLine(text: string): void {
		this.write(text + '\n');
	}

	reveal(): void {
		this.ensure().show(true);
	}
}
