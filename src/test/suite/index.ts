import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

/**
 * Recursively collect compiled test files (`*.test.js`) under `dir`.
 * Replaces the old `glob` dependency with a small, dependency-free walk.
 */
function findTestFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findTestFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.test.js')) {
			results.push(full);
		}
	}
	return results;
}

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		try {
			// Add every compiled test file to the suite
			for (const file of findTestFiles(testsRoot)) {
				mocha.addFile(file);
			}

			// Run the mocha test
			mocha.run((failures) => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}
