import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// The service worker serves the cached `/` shell for every route when offline, so asset
			// URLs must be absolute: a relative `./_app/...` breaks on `/proto/take`.
			paths: { relative: false },
			// Check for a new deploy every 5 min; the root layout reloads on the next navigation.
			version: { pollInterval: 5 * 60_000 }
		})
	],
	// Agent worktrees and QA output live inside the repo folder; watching them reloads the page.
	server: { watch: { ignored: ['**/.claude/**', '**/.qa/**'] } },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
