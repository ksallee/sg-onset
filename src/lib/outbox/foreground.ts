// Keeps a runner draining while the page is in the foreground and online. iPadOS has no
// background sync: a hidden page is suspended within seconds and its requests stall. So the
// runner is stopped on hide and started on show, on network return and when a retry falls due.

import type { Runner, RunnerEnv } from './runner';

export type PageEvent = 'visible' | 'hidden' | 'online' | 'offline';

export type Page = {
	visible(): boolean;
	online(): boolean;
	now(): number;
	/** Calls `fn` on the event; returns the unlisten. */
	listen(event: PageEvent, fn: () => void): () => void;
	/** Calls `fn` after `ms`; returns the cancel. */
	timer(ms: number, fn: () => void): () => void;
};

/** Stops listening and drops the timer. `kick()` drains now: call it after a save. */
export type Foreground = (() => void) & { kick(): void };

export function runInForeground(runner: Runner, page: Page): Foreground {
	let cancelTimer: (() => void) | undefined;

	const dropTimer = () => {
		cancelTimer?.();
		cancelTimer = undefined;
	};

	const kick = () => {
		if (!page.visible() || !page.online()) return;
		dropTimer();
		void runner.drain().then((report) => {
			if (report.stopped !== 'waiting' || report.waitUntil === undefined || cancelTimer) return;
			if (!page.visible()) return;
			cancelTimer = page.timer(Math.max(0, report.waitUntil - page.now()), () => {
				cancelTimer = undefined;
				kick();
			});
		});
	};

	const hide = () => {
		dropTimer();
		runner.stop();
	};

	const unlisten = [
		page.listen('visible', kick),
		page.listen('online', kick),
		page.listen('hidden', hide),
		page.listen('offline', dropTimer)
	];
	kick();

	return Object.assign(
		() => {
			dropTimer();
			for (const off of unlisten) off();
		},
		{ kick }
	);
}

/** The real page. Call in the browser. `pagehide` counts as hidden: iOS does not always fire the other. */
export function browserPage(): Page {
	return {
		visible: () => document.visibilityState === 'visible',
		online: () => navigator.onLine,
		now: () => Date.now(),
		listen(event, fn) {
			if (event === 'online' || event === 'offline') {
				window.addEventListener(event, fn);
				return () => window.removeEventListener(event, fn);
			}
			const onVisibility = () => {
				if ((document.visibilityState === 'visible') === (event === 'visible')) fn();
			};
			const pageEvent = event === 'visible' ? 'pageshow' : 'pagehide';
			document.addEventListener('visibilitychange', onVisibility);
			window.addEventListener(pageEvent, fn);
			return () => {
				document.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener(pageEvent, fn);
			};
		},
		timer(ms, fn) {
			const id = setTimeout(fn, ms);
			return () => clearTimeout(id);
		}
	};
}

/** The runner's env for the real page. */
export function browserEnv(page: Page = browserPage()): RunnerEnv {
	return { now: page.now, visible: page.visible, online: page.online, random: Math.random, timer: page.timer };
}
