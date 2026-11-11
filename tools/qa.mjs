#!/usr/bin/env node
// `pnpm qa`: build, serve the build, run the e2e suite on every target, write a short report.
//
//   pnpm qa                       everything
//   pnpm qa -- e2e/take.spec.ts   one spec (any Playwright arguments pass through)
//   pnpm qa -- --project ipad-landscape
//
// Output, gitignored: .qa/report.md (the summary), .qa/shots/ (a screenshot per page and
// target), .qa/results/ (per test: screenshot, trace on failure), .qa/html/ (Playwright's report).
// Exits 1 when a test fails. No secrets, no network beyond localhost.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.qa');
const pass = process.argv.slice(2).filter((a) => a !== '--');

function freePort() {
	return new Promise((res, rej) => {
		const s = createServer();
		s.once('error', rej);
		s.listen(0, '127.0.0.1', () => {
			const { port } = s.address();
			s.close(() => res(port));
		});
	});
}

function run(cmd, args, env = {}) {
	const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
	return r.status ?? 1;
}

const started = Date.now();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('qa: build');
if (run('pnpm', ['build']) !== 0) {
	console.error('qa: build failed');
	process.exit(1);
}
const built = Date.now();

// A port of its own, so a dev server or another worktree's run never answers instead.
const port = await freePort();
console.log(`qa: e2e on 127.0.0.1:${port}`);
const status = run('pnpm', ['exec', 'playwright', 'test', ...pass], { E2E_PORT: String(port), E2E_OUT: OUT });
const done = Date.now();

// ------------------------------------------------------------ the report

const resultsFile = resolve(OUT, 'results.json');
if (!existsSync(resultsFile)) {
	console.error('qa: no results.json; Playwright did not run');
	process.exit(1);
}
const results = JSON.parse(readFileSync(resultsFile, 'utf8'));

const tests = [];
const walk = (suite, file) => {
	for (const spec of suite.specs ?? []) {
		for (const t of spec.tests) {
			const r = t.results.at(-1);
			tests.push({ file: spec.file ?? file, title: spec.title, project: t.projectName, status: t.status, result: r, annotations: [...(t.annotations ?? [])] });
		}
	}
	for (const s of suite.suites ?? []) walk(s, s.file ?? file);
};
for (const s of results.suites) walk(s, s.file);

const audits = [];
for (const t of tests) {
	for (const a of t.result?.attachments ?? []) {
		if (a.name !== 'layout-audit.json') continue;
		const body = a.body ? Buffer.from(a.body, 'base64').toString() : a.path && existsSync(a.path) ? readFileSync(a.path, 'utf8') : null;
		if (body) audits.push({ project: t.project, ...JSON.parse(body) });
	}
}

const count = (s) => tests.filter((t) => t.status === s).length;
const secs = (ms) => `${Math.round(ms / 1000)} s`;
const lines = [];
lines.push('# QA report', '');
lines.push(`${new Date().toISOString()} · build ${secs(built - started)} · e2e ${secs(done - built)} · total ${secs(done - started)}`, '');
lines.push(`**${status === 0 ? 'PASS' : 'FAIL'}**: ${count('expected')} passed, ${count('unexpected')} failed, ${count('flaky')} flaky, ${count('skipped')} skipped (fixme).`, '');

const failed = tests.filter((t) => t.status === 'unexpected' || t.status === 'flaky');
if (failed.length) {
	lines.push('## Failed', '');
	for (const t of failed) {
		const msg = (t.result?.errors?.[0]?.message ?? t.result?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0];
		lines.push(`- [${t.project}] ${t.file} › ${t.title}: ${msg}`);
	}
	lines.push('');
}

const fixme = tests.filter((t) => t.status === 'skipped');
if (fixme.length) {
	lines.push('## Fixme (known app bugs, see the spec for why)', '');
	for (const title of [...new Set(fixme.map((t) => `${t.file} › ${t.title}`))]) {
		lines.push(`- ${title} (${fixme.filter((t) => `${t.file} › ${t.title}` === title).map((t) => t.project).join(', ')})`);
	}
	lines.push('');
}

if (audits.length) {
	lines.push('## Layout audit', '', 'Overflow fails the test. Names and 44 px targets are reported only.', '');
	lines.push('| target | page | controls | overflow px | too wide | no name | under 44 px |', '|---|---|---|---|---|---|---|');
	for (const a of audits) lines.push(`| ${a.project} | ${a.label} | ${a.controls} | ${a.overflowX} | ${a.wide.length} | ${a.unnamed.length} | ${a.small.length} |`);
	const offenders = audits.flatMap((a) => [
		...a.unnamed.map((o) => `- [${a.project}] ${a.label}: no name: ${o.what} (${o.width}×${o.height})`),
		...a.small.map((o) => `- [${a.project}] ${a.label}: ${o.width}×${o.height}: ${o.what}`),
		...a.wide.map((o) => `- [${a.project}] ${a.label}: wider than the viewport: ${o.what} (${o.width} px)`)
	]);
	if (offenders.length) lines.push('', '### Offenders', '', ...offenders);
	lines.push('');
}

lines.push('## Files', '', '- `.qa/shots/<target>/<page>.png`: one per page and target', '- `.qa/results/`: per test, its screenshot; a trace on failure', '- `.qa/html/index.html`: Playwright\'s report (`pnpm exec playwright show-report .qa/html`)', '');
writeFileSync(resolve(OUT, 'report.md'), lines.join('\n'));
console.log(`qa: ${status === 0 ? 'PASS' : 'FAIL'} in ${secs(done - started)}; report in .qa/report.md`);
process.exit(status === 0 ? 0 : 1);
