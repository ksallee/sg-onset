// End-to-end tests against a production build: the service worker only caches in a real build.
// `pnpm qa` builds first and runs this; `pnpm e2e` runs it on the build already there. See
// e2e/README.md.
import { defineConfig } from '@playwright/test';
import { TARGETS, contextFor } from './e2e/targets.mjs';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const OUT = process.env.E2E_OUT ?? '.qa';

export default defineConfig({
	testDir: 'e2e',
	outputDir: `${OUT}/results`,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: process.env.CI ? 2 : undefined,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	reporter: [
		['list'],
		['json', { outputFile: `${OUT}/results.json` }],
		['html', { outputFolder: `${OUT}/html`, open: 'never' }]
	],
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		screenshot: 'on',
		trace: 'retain-on-failure',
		// Every page in the suite starts with no stored appearance: the system, which is light.
		colorScheme: 'light'
	},
	projects: TARGETS.map((t) => ({
		name: t.name,
		use: { browserName: t.browser, ...contextFor(t) }
	})),
	webServer: {
		command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
		url: `http://127.0.0.1:${PORT}/`,
		reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
		timeout: 60_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
