import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { CodePulseCommand, isLongRunning, parseCargoLine } from './cargo';
import { PtyTerminal } from './terminal';
import { State, StatusBar } from './statusBar';

// Code Pulse watches saves, runs cargo, and reflects the result in the status
// bar. The watcher is VS Code's save event; the status comes from cargo's JSON
// message stream rather than scraping human-readable output.

let statusBar: StatusBar;
let output: PtyTerminal | undefined;
let log: vscode.OutputChannel | undefined;
let currentChild: ChildProcessWithoutNullStreams | undefined;
let saveDebounce: NodeJS.Timeout | undefined;
let activeCommand: CodePulseCommand = 'run';
let buildStartedAt = 0;
let errorCount = 0;
let warningCount = 0;

export function activate(context: vscode.ExtensionContext): void {
	log = vscode.window.createOutputChannel('Code Pulse');
	statusBar = new StatusBar(logLine);
	context.subscriptions.push(log, { dispose: () => statusBar.dispose() });
	setStatus(State.Idle);
	statusBar.show();

	context.subscriptions.push(
		vscode.commands.registerCommand('codePulse.start', () => start(true)),
		vscode.commands.registerCommand('codePulse.stop', () => stop(true)),
		vscode.commands.registerCommand('codePulse.showOutput', () => output?.reveal()),
		vscode.commands.registerCommand('codePulse.selectCommand', () => selectCommand()),
	);

	// Rebuild when a Rust file is saved, debounced so "save all" fires once.
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
	const t = new Date().toISOString().slice(11, 23);
	log?.appendLine(`${t}  ${message}`);
}

function setStatus(state: State): void {
	const command = state === State.Idle
		? (getConfig().get<string>('command', 'run') as CodePulseCommand)
		: activeCommand;
	statusBar.render(state, { command, startedAt: buildStartedAt, errors: errorCount, warnings: warningCount });
}

// Pick a cargo command, save it, and rebuild.
async function selectCommand(): Promise<void> {
	const current = getConfig().get<string>('command', 'run');
	const items: vscode.QuickPickItem[] = [
		{ label: 'run', description: 'cargo run, compile and launch the binary/server' },
		{ label: 'check', description: 'cargo check, fast type-check with no binary' },
		{ label: 'clippy', description: 'cargo clippy, lint with Clippy' },
		{ label: 'test', description: 'cargo test, build and run tests' },
	];
	for (const item of items) {
		if (item.label === current) {
			item.description += '  (current)';
		}
	}
	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: `Code Pulse command (currently: ${current})`,
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

// Start or restart a build. `reveal` brings the terminal forward, which we want
// for a manual click but not for a rebuild triggered by saving.
function start(reveal: boolean): void {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		vscode.window.showErrorMessage('Code Pulse: open a folder containing a Cargo project first.');
		return;
	}

	stop(false); // kill any in-flight build/server before starting a new one

	const config = getConfig();
	const command = config.get<string>('command', 'run') as CodePulseCommand;
	const cargoPath = config.get<string>('cargoPath', 'cargo');
	const cwd = folder.uri.fsPath;
	activeCommand = command;
	buildStartedAt = Date.now();
	errorCount = 0;
	warningCount = 0;

	const args = [command, '--message-format=json-diagnostic-rendered-ansi'];

	const term = ensureTerminal();
	term.clear();
	term.writeLine(`\x1b[2m$ ${cargoPath} ${args.join(' ')}\x1b[0m`);
	if (reveal) {
		term.reveal();
	}

	logLine(`> cargo ${command}`);
	setStatus(State.Building);

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
				logLine(`build-finished: success=${success}`);
				setStatus(success ? (isLongRunning(command) ? State.Running : State.Done) : State.Failed);
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
			return; // a newer run replaced this one
		}
		currentChild = undefined;
		const failed = buildSucceeded === false || (code !== 0 && code !== null);
		if (failed) {
			logLine(`exited code=${code} -> Failed`);
			setStatus(State.Failed);
			maybeRevealOnFailure(term);
		} else {
			// Server stopped, or a program/test run finished cleanly.
			logLine(`exited code=${code} -> Done`);
			setStatus(State.Done);
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
			output?.writeLine('\x1b[2m-- stopped --\x1b[0m');
		}
	}
	if (showMessage) {
		setStatus(State.Idle);
	}
}

// Kill cargo and the binary it spawned. A plain child.kill() only signals
// cargo, which can leave a server running and holding its port.
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
			if (parsed.level === 'error') {
				errorCount++;
			} else if (parsed.level === 'warning') {
				warningCount++;
			}
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
	setStatus(State.Failed);
	vscode.window.showErrorMessage(`Code Pulse: ${hint}`);
	output?.writeLine(`\x1b[31mError: ${hint}\x1b[0m`);
}

function maybeRevealOnFailure(term: PtyTerminal): void {
	if (getConfig().get<boolean>('revealTerminalOnFailure', true)) {
		term.reveal();
	}
}

function ensureTerminal(): PtyTerminal {
	if (!output) {
		// Closing the terminal stops the run and resets the icon, so the status
		// never goes stale and no replacement terminal gets spawned.
		output = new PtyTerminal(() => {
			logLine('terminal closed');
			stop(false);
			setStatus(State.Idle);
		});
	}
	return output;
}
