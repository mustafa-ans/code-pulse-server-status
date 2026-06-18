import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

/**
 * Code Pulse — self-contained Rust build/server status in the status bar.
 * Watcher = VS Code save event; build status = cargo JSON message format.
 */

type CodePulseCommand = 'check' | 'run';

const enum State {
	Idle,
	Building,
	Ok,       // `cargo check` succeeded
	Running,  // `cargo run` build succeeded; binary/server is up
	Failed,
}

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
let log: vscode.OutputChannel | undefined;
let currentChild: ChildProcessWithoutNullStreams | undefined;
let saveDebounce: NodeJS.Timeout | undefined;
let activeCommand: CodePulseCommand = 'run';

export function activate(context: vscode.ExtensionContext): void {
	log = vscode.window.createOutputChannel('Code Pulse');
	context.subscriptions.push(log);

	// No id: priority alone controls position. Higher = further LEFT (toward
	// rust-analyzer / language indicators); lower = further right.
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.name = 'Code Pulse';
	statusBarItem.command = 'codePulse.start';
	context.subscriptions.push(statusBarItem);
	setState(State.Idle);
	statusBarItem.show();

	context.subscriptions.push(
		vscode.commands.registerCommand('codePulse.start', () => start(true)),
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
			if (saveDebounce) {
				clearTimeout(saveDebounce);
			}
			saveDebounce = setTimeout(() => start(false), 250);
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

function logLine(message: string): void {
	const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
	log?.appendLine(`${t}  ${message}`);
}

/**
 * Quick-pick to switch the cargo command (check / run) without editing
 * settings, then rebuild with the new command.
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
	start(true);
}

/**
 * Start (or restart) a build. `reveal` brings the reused terminal to the front
 * — true for manual clicks, false for save-triggered rebuilds.
 */
function start(reveal: boolean): void {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		vscode.window.showErrorMessage('Code Pulse: open a folder containing a Cargo project first.');
		return;
	}

	// Restart semantics: kill any in-flight build/server before starting anew.
	stop(false);

	const config = getConfig();
	const command = (config.get<string>('command', 'run') as CodePulseCommand);
	const cargoPath = config.get<string>('cargoPath', 'cargo');
	const cwd = folder.uri.fsPath;
	activeCommand = command;

	const args = [command, '--message-format=json-diagnostic-rendered-ansi'];

	const term = ensureTerminal();
	term.clear(); // fresh output for each build
	term.writeLine(`\x1b[2m$ ${cargoPath} ${args.join(' ')}\x1b[0m`);
	if (reveal) {
		term.reveal();
	}

	logLine(`▶ cargo ${command}`);
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
				const next = success ? (command === 'run' ? State.Running : State.Ok) : State.Failed;
				logLine(`build-finished: success=${success}`);
				setState(next);
				if (!success) {
					maybeRevealOnFailure(term);
				}
			});
		}
	});

	child.stderr.on('data', (data: Buffer) => term.write(data.toString()));

	child.on('error', (err) => failSpawn(err));

	child.on('close', (code) => {
		if (currentChild !== child) {
			return; // superseded by a newer run; ignore.
		}
		currentChild = undefined;
		const failed = buildSucceeded === false || (code !== 0 && code !== null);
		if (failed) {
			logLine(`process exited: code=${code} → Failed`);
			setState(State.Failed);
			maybeRevealOnFailure(term);
		} else {
			// `check` stays OK; a `run` process that exited cleanly is idle again.
			logLine(`process exited: code=${code} → ${command === 'run' ? 'Idle (flatline)' : 'Ok'}`);
			setState(command === 'run' ? State.Idle : State.Ok);
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
		killProcessTree(child);
		if (showMessage) {
			logLine('stopped by user');
			output?.writeLine('\x1b[2m-- stopped by user --\x1b[0m');
		}
	}
	if (showMessage) {
		setState(State.Idle);
	}
}

/**
 * Kill cargo AND the binary/server it spawned. `child.kill()` alone only signals
 * cargo, orphaning a long-running server (and tying up its port on restart).
 */
function killProcessTree(child: ChildProcessWithoutNullStreams): void {
	const pid = child.pid;
	if (pid === undefined) {
		return;
	}
	if (process.platform === 'win32') {
		const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
		killer.on('error', () => {
			try { child.kill(); } catch { /* already gone */ }
		});
	} else {
		try { child.kill(); } catch { /* already gone */ }
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
	const hint = message.includes('ENOENT')
		? 'cargo was not found on your PATH. Install Rust (rustup) or set "codePulse.cargoPath".'
		: message;
	logLine(`spawn error: ${hint}`);
	setState(State.Failed);
	vscode.window.showErrorMessage(`Code Pulse: ${hint}`);
	output?.writeLine(`\x1b[31mError: ${hint}\x1b[0m`);
}

function maybeRevealOnFailure(term: PtyTerminal): void {
	if (getConfig().get<boolean>('revealTerminalOnFailure', true)) {
		term.reveal();
	}
}

function stateName(state: State): string {
	switch (state) {
		case State.Idle: return 'idle (flatline)';
		case State.Building: return 'building';
		case State.Ok: return 'cargo check ok';
		case State.Running: return 'running (pulse)';
		case State.Failed: return 'failed';
	}
}

/**
 * Icon-only status. The hover tooltip is the "help text": it names the cargo
 * command and what a click does. Pulse = alive, flatline = not running.
 */
function setState(state: State): void {
	statusBarItem.backgroundColor = undefined;
	const cmd = state === State.Idle ? getConfig().get<string>('command', 'run') : activeCommand;
	switch (state) {
		case State.Idle:
			// Flatline = no pulse (nothing running). Pairs with $(pulse) below.
			statusBarItem.text = '$(dash)';
			statusBarItem.tooltip = `Code Pulse · idle (flatline) — click to run cargo ${cmd}`;
			break;
		case State.Building:
			statusBarItem.text = '$(sync~spin)';
			statusBarItem.tooltip = `Code Pulse · building — cargo ${cmd}`;
			break;
		case State.Ok:
			statusBarItem.text = '$(check)';
			statusBarItem.tooltip = 'Code Pulse · cargo check passed — click to re-check';
			break;
		case State.Running:
			statusBarItem.text = '$(pulse)';
			statusBarItem.tooltip = 'Code Pulse · running cargo run — click to restart';
			break;
		case State.Failed:
			statusBarItem.text = '$(error)';
			statusBarItem.tooltip = `Code Pulse · cargo ${cmd} failed — click to rebuild`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			break;
	}
	logLine(`icon → ${stateName(state)}`);
}

function ensureTerminal(): PtyTerminal {
	if (!output) {
		output = new PtyTerminal(() => {
			// User closed the Code Pulse terminal: stop the run and reset so the
			// status doesn't go stale and no replacement terminal is spawned.
			logLine('terminal closed → Idle');
			stop(false);
			setState(State.Idle);
		});
	}
	return output;
}

/**
 * A single reusable pseudo-terminal kept for the extension's lifetime so every
 * build streams into the same "Code Pulse" terminal instead of spawning a new
 * one each time.
 */
class PtyTerminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	private terminal: vscode.Terminal | undefined;
	private closeSub: vscode.Disposable | undefined;

	constructor(private readonly onClose?: () => void) {}

	private create(): vscode.Terminal {
		const pty: vscode.Pseudoterminal = {
			onDidWrite: this.writeEmitter.event,
			open: () => { /* nothing to do */ },
			close: () => { /* keep emitter for reuse */ },
		};
		const terminal = vscode.window.createTerminal({ name: 'Code Pulse', pty });
		this.terminal = terminal;
		this.closeSub?.dispose();
		this.closeSub = vscode.window.onDidCloseTerminal((closed) => {
			if (closed === this.terminal) {
				this.terminal = undefined;
				this.onClose?.();
			}
		});
		return terminal;
	}

	private ensure(): vscode.Terminal {
		return this.terminal ?? this.create();
	}

	clear(): void {
		this.ensure();
		// ANSI: clear screen + scrollback + move cursor home.
		this.writeEmitter.fire('\x1b[2J\x1b[3J\x1b[H');
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
