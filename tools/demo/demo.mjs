#!/usr/bin/env node
// `pnpm demo`: the feature video, square 1080, dark, on the sample project. See tools/demo/README.md.
//
//   pnpm demo -- --out ~/Desktop/clips                     build, record, compose
//   pnpm demo -- --out /tmp/demo --photo set.jpg           a real reference photo for the markup part
//   pnpm demo -- --out /tmp/demo --url http://127.0.0.1:4791   a production build already served
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from './compose.mjs';
import { record } from './record.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function args(argv) {
	const a = {};
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		if (k === '--') continue;
		else if (k === '--out') a.out = argv[++i];
		else if (k === '--photo') a.photo = argv[++i];
		else if (k === '--url') a.url = argv[++i];
		else throw new Error(`unknown flag ${k}`);
	}
	if (!a.out) throw new Error('--out <folder> is required');
	return a;
}

/** A free port from the system: never the usual 5173 or 4173. */
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

async function preview() {
	const port = await freePort();
	const proc = spawn('./node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	proc.stdout.resume();
	proc.stderr.resume();
	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url + '/')).ok) return { url, proc };
		} catch {}
		if (proc.exitCode !== null) throw new Error(`vite preview exited ${proc.exitCode}`);
		await new Promise((r) => setTimeout(r, 250));
	}
	proc.kill();
	throw new Error('vite preview did not start in 60 s');
}

async function main() {
	const a = args(process.argv.slice(2));
	const out = resolve(a.out);
	mkdirSync(out, { recursive: true });
	const photo = a.photo
		? { name: `set${extname(a.photo)}`, mimeType: /\.png$/i.test(a.photo) ? 'image/png' : 'image/jpeg', buffer: readFileSync(a.photo) }
		: null;
	let server = null;
	let base = a.url?.replace(/\/$/, '');
	if (!base) {
		if (spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) throw new Error('build failed');
		server = await preview();
		base = server.url;
	}
	try {
		const take = await record(base, out, photo);
		console.log(`${take.shots.length} frames`);
		console.log(await compose(take, out));
	} finally {
		server?.proc.kill();
	}
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
