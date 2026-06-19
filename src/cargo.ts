// Cargo's machine-readable message stream is our source of truth for build
// status. Everything here is pure and VS Code-free, so it's unit-testable.

export type CargoCommand = 'check' | 'run' | 'clippy' | 'test';

// `run` and `test` keep a process alive after the build; `check`/`clippy` don't.
export function isLongRunning(command: CargoCommand): boolean {
	return command === 'run' || command === 'test';
}

interface CargoMessage {
	reason: string;
	success?: boolean; // present on reason === 'build-finished'
	message?: {
		level?: string;
		rendered?: string;
	};
}

export type ParsedCargoLine =
	| { kind: 'build-finished'; success: boolean }
	| { kind: 'compiler-message'; level: string | undefined; rendered: string }
	| { kind: 'passthrough'; text: string };

// A line that isn't a recognized cargo record is treated as program output.
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
		return { kind: 'compiler-message', level: msg.message.level, rendered: msg.message.rendered };
	}
	if (msg.reason === 'build-finished') {
		return { kind: 'build-finished', success: msg.success === true };
	}
	return undefined;
}
