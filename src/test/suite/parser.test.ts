import * as assert from 'assert';
import { parseCargoLine } from '../../cargo';

suite('parseCargoLine', () => {
	test('blank lines are ignored', () => {
		assert.strictEqual(parseCargoLine(''), undefined);
		assert.strictEqual(parseCargoLine('   '), undefined);
	});

	test('plain program output passes through verbatim', () => {
		assert.deepStrictEqual(parseCargoLine('Listening on :8080'), {
			kind: 'passthrough',
			text: 'Listening on :8080',
		});
	});

	test('a line that looks like JSON but is not passes through', () => {
		assert.deepStrictEqual(parseCargoLine('{ not json'), {
			kind: 'passthrough',
			text: '{ not json',
		});
	});

	test('valid JSON without a cargo reason passes through', () => {
		const line = JSON.stringify({ hello: 'world' });
		assert.deepStrictEqual(parseCargoLine(line), { kind: 'passthrough', text: line });
	});

	test('build-finished success is reported', () => {
		assert.deepStrictEqual(
			parseCargoLine(JSON.stringify({ reason: 'build-finished', success: true })),
			{ kind: 'build-finished', success: true },
		);
	});

	test('build-finished failure is reported', () => {
		assert.deepStrictEqual(
			parseCargoLine(JSON.stringify({ reason: 'build-finished', success: false })),
			{ kind: 'build-finished', success: false },
		);
	});

	test('build-finished without an explicit success defaults to failure', () => {
		assert.deepStrictEqual(
			parseCargoLine(JSON.stringify({ reason: 'build-finished' })),
			{ kind: 'build-finished', success: false },
		);
	});

	test('compiler-message exposes its level and rendered diagnostic', () => {
		const rendered = 'error[E0425]: cannot find value `x` in this scope';
		assert.deepStrictEqual(
			parseCargoLine(JSON.stringify({ reason: 'compiler-message', message: { level: 'error', rendered } })),
			{ kind: 'compiler-message', level: 'error', rendered },
		);
	});

	test('a warning-level compiler-message keeps its level', () => {
		const rendered = 'warning: unused variable: `y`';
		assert.deepStrictEqual(
			parseCargoLine(JSON.stringify({ reason: 'compiler-message', message: { level: 'warning', rendered } })),
			{ kind: 'compiler-message', level: 'warning', rendered },
		);
	});

	test('compiler-message without a rendered body is not acted on', () => {
		assert.strictEqual(
			parseCargoLine(JSON.stringify({ reason: 'compiler-message', message: { level: 'error' } })),
			undefined,
		);
	});

	test('other cargo records (e.g. compiler-artifact) are ignored', () => {
		assert.strictEqual(
			parseCargoLine(JSON.stringify({ reason: 'compiler-artifact' })),
			undefined,
		);
	});
});
