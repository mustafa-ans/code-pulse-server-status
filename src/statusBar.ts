import * as vscode from 'vscode';
import { CodePulseCommand } from './cargo';

export enum State {
	Idle,      // flatline, nothing running
	Building,  // spinner
	Running,   // pulse, a run/test process is alive
	Done,      // check, finished successfully
	Failed,    // red cross
}

export interface StatusContext {
	command: CodePulseCommand;
	startedAt: number; // Date.now() at build start, for elapsed time
	errors: number;
	warnings: number;
}

// The icon mirrors the project's namesake: pulse when something is alive,
// flatline when idle, check when it finished, red when it broke.
export class StatusBar {
	private readonly item: vscode.StatusBarItem;

	constructor(private readonly log: (message: string) => void) {
		// Left side, where the eye lands first; priority sets the order.
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.name = 'Code Pulse';
		this.item.command = 'codePulse.start';
	}

	show(): void {
		this.item.show();
	}

	dispose(): void {
		this.item.dispose();
	}

	render(state: State, ctx: StatusContext): void {
		this.item.backgroundColor = undefined;
		const cmd = ctx.command;
		const extra = countsSuffix(ctx);
		switch (state) {
			case State.Idle:
				this.item.text = '$(dash)';
				this.item.tooltip = `Code Pulse: idle. Click to run cargo ${cmd}.`;
				break;
			case State.Building:
				this.item.text = '$(sync~spin)';
				this.item.tooltip = `Code Pulse: building cargo ${cmd}.`;
				break;
			case State.Running:
				this.item.text = '$(pulse)';
				this.item.tooltip = `Code Pulse: cargo ${cmd} running. Click to restart.`;
				break;
			case State.Done: {
				this.item.text = '$(check)';
				const verb = cmd === 'run' ? 'ran OK' : cmd === 'test' ? 'tests passed' : 'passed';
				this.item.tooltip = `Code Pulse: cargo ${cmd} ${verb} in ${elapsed(ctx)}${extra}. Click to run again.`;
				break;
			}
			case State.Failed:
				this.item.text = '$(error)';
				this.item.tooltip = `Code Pulse: cargo ${cmd} failed in ${elapsed(ctx)}${extra}. Click to rebuild.`;
				this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
				break;
		}
		this.log(`icon -> ${label(state)}`);
	}
}

function label(state: State): string {
	switch (state) {
		case State.Idle: return 'idle (flatline)';
		case State.Building: return 'building';
		case State.Running: return 'running (pulse)';
		case State.Done: return 'done (check)';
		case State.Failed: return 'failed';
	}
}

function elapsed(ctx: StatusContext): string {
	if (!ctx.startedAt) {
		return '';
	}
	const s = (Date.now() - ctx.startedAt) / 1000;
	return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function countsSuffix(ctx: StatusContext): string {
	const parts: string[] = [];
	if (ctx.errors > 0) {
		parts.push(`${ctx.errors} error${ctx.errors === 1 ? '' : 's'}`);
	}
	if (ctx.warnings > 0) {
		parts.push(`${ctx.warnings} warning${ctx.warnings === 1 ? '' : 's'}`);
	}
	return parts.length ? ` (${parts.join(', ')})` : '';
}
