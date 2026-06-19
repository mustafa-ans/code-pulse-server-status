import * as vscode from 'vscode';

// One reusable pseudo-terminal for the whole session, so builds stream into the
// same "Code Vitals" terminal instead of opening a new one every time.
export class PtyTerminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	private terminal: vscode.Terminal | undefined;
	private closeSub: vscode.Disposable | undefined;

	constructor(private readonly onClose?: () => void) {}

	private create(): vscode.Terminal {
		const pty: vscode.Pseudoterminal = {
			onDidWrite: this.writeEmitter.event,
			open: () => { /* nothing to do */ },
			close: () => { /* keep the emitter for reuse */ },
		};
		const terminal = vscode.window.createTerminal({ name: 'Code Vitals', pty });
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
		this.writeEmitter.fire('\x1b[2J\x1b[3J\x1b[H'); // screen + scrollback + home
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
