#!/usr/bin/env node
// Screenshots of routes × viewports × themes × hands, for looking at a change. See e2e/README.md.
//
//   pnpm shots -- --out /tmp/shots
//   pnpm shots -- --routes /shoot --viewports ipad-landscape,820x1180 --themes dark,night --hands right,left --out /tmp/shots
//   pnpm shots -- --url http://127.0.0.1:5173 --out /tmp/shots     (a server already running)
//   pnpm shots -- --preview --out /tmp/shots                        (build, then the real build)
//
// Without --url it starts `vite dev` on a free port: the code as it is now, no build. Viewports
// are the e2e targets (e2e/targets.mjs: ipad-landscape, ipad-portrait, phone) or WIDTHxHEIGHT.
// Themes: day, dark, night (the take screen's `?theme=`, and the app's stored settings: day is
// the light appearance, night is red night mode). A page in the shell gets the sample project. Hands: right, left (`?hand=`). Files are named
// <route>_<viewport>_<theme>_<hand>.png. Prints each path; exits 1 if a page threw.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { contextFor, targetFor } from '../e2e/targets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
	const a = { routes: ['/welcome', '/shoot', '/slates', '/settings', '/sign-in'], viewports: ['ipad-landscape', 'ipad-portrait', 'phone'], themes: ['dark'], hands: ['right'], settle: 600 };
	const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		const next = () => argv[++i];
		switch (k) {
			case '--': break;
			case '--routes': a.routes = list(next()); break;
			case '--viewports': a.viewports = list(next()); break;
			case '--themes': a.themes = list(next()); break;
			case '--hands': a.hands = list(next()); break;
			case '--out': a.out = next(); break;
			case '--url': a.url = next(); break;
			case '--preview': a.preview = true; break;
			case '--full': a.full = true; break;
			case '--settle': a.settle = Number(next()); break;
			default: throw new Error(`unknown flag ${k}`);
		}
	}
	if (!a.out) throw new Error('--out <folder> is required');
	for (const t of a.themes) if (!['day', 'dark', 'night'].includes(t)) throw new Error(`unknown theme ${t}`);
	for (const h of a.hands) if (!['left', 'right'].includes(h)) throw new Error(`unknown hand ${h}`);
	return a;
}

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

async function serve(mode) {
	const port = await freePort();
	const proc = spawn('./node_modules/.bin/vite', [mode, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
	// An unread pipe fills at 64 KB and blocks the writer.
	proc.stdout.resume();
	proc.stderr.resume();
	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url + '/')).ok) return { url, proc };
		} catch {}
		if (proc.exitCode !== null) throw new Error(`vite ${mode} exited ${proc.exitCode}`);
		await new Promise((r) => setTimeout(r, 250));
	}
	proc.kill();
	throw new Error(`vite ${mode} did not start in 60 s`);
}

const slug = (route) => route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'home';

async function main() {
	const a = args(process.argv.slice(2));
	const out = resolve(a.out);
	mkdirSync(out, { recursive: true });
	let server = null;
	let base = a.url?.replace(/\/$/, '');
	if (!base) {
		if (a.preview && spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) throw new Error('build failed');
		server = await serve(a.preview ? 'preview' : 'dev');
		base = server.url;
	}

	const browsers = {};
	let failed = false;
	try {
		for (const v of a.viewports) {
			const target = targetFor(v);
			browsers[target.browser] ??= await (target.browser === 'webkit' ? webkit : chromium).launch();
			for (const theme of a.themes) {
				const context = await browsers[target.browser].newContext({ ...contextFor(target), colorScheme: theme === 'day' ? 'light' : 'dark' });
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', (e) => errors.push(e.message));
				for (const hand of a.hands) {
					// The app's stored settings (lib/app/settings.ts), kept over whatever a page changes.
					// Init scripts add up and the last one wins.
					await context.addInitScript(
						(look) => localStorage.setItem('sg-onset.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg-onset.settings') ?? '{}'), ...look })),
						{ appearance: theme === 'day' ? 'light' : 'dark', night: theme === 'night', hand }
					);
					for (const route of a.routes) {
						const url = new URL(base + route);
						url.searchParams.set('theme', theme);
						url.searchParams.set('hand', hand);
						await page.goto(url.href, { waitUntil: 'load' });
						await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 15_000 });
						// A page in the shell needs a project. A device with none is sent to the first run:
						// load the sample project there, then open the page again.
						await page.waitForTimeout(300);
						if (new URL(page.url()).pathname === '/welcome' && url.pathname !== '/welcome') {
							await page.getByRole('button', { name: 'Load the Sample Project' }).click();
							await page.waitForURL('**/shoot');
							await page.goto(url.href, { waitUntil: 'load' });
							await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 15_000 });
						}
						// A dev server optimises dependencies on first sight and reloads: let it settle.
						await page.waitForTimeout(a.settle);
						const file = resolve(out, `${slug(route)}_${target.name}_${theme}_${hand}.png`);
						await page.screenshot({ path: file, fullPage: !!a.full });
						console.log(file);
					}
				}
				if (errors.length) {
					failed = true;
					console.error(`page errors (${target.name}, ${theme}):\n  ${errors.join('\n  ')}`);
				}
				await context.close();
			}
		}
	} finally {
		for (const b of Object.values(browsers)) await b.close();
		server?.proc.kill();
	}
	process.exit(failed ? 1 : 0);
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
