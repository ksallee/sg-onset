// A preview server of its own, for a test that takes the network away. Stopping the server is
// how the suite goes offline: Playwright's `context.setOffline` breaks pages the service worker
// serves in WebKit ("WebKit encountered an internal error"), and a dead server is what the
// worker meets offline anyway: a failed fetch. Each server is its own origin, so its service
// worker and caches start empty.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const s = createServer();
		s.once('error', reject);
		s.listen(0, '127.0.0.1', () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});
}

export interface Preview {
	origin: string;
	stop: () => Promise<void>;
}

export async function startPreview(): Promise<Preview> {
	const port = await freePort();
	const proc: ChildProcess = spawn('./node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
		stdio: 'ignore'
	});
	const origin = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 30_000;
	for (;;) {
		try {
			if ((await fetch(`${origin}/`)).ok) break;
		} catch {
			// Not up yet.
		}
		if (proc.exitCode !== null) throw new Error(`vite preview exited ${proc.exitCode}`);
		if (Date.now() > deadline) {
			proc.kill();
			throw new Error('vite preview did not start in 30 s');
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	const stop = () =>
		new Promise<void>((resolve) => {
			if (proc.exitCode !== null) return resolve();
			proc.once('exit', () => resolve());
			proc.kill();
		});
	return { origin, stop };
}
