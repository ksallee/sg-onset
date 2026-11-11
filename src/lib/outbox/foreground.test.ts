import { describe, expect, it } from 'vitest';
import { runInForeground } from './foreground';
import type { DrainReport, Runner } from './runner';

const idle: DrainReport = { stopped: 'idle', unsynced: { entries: 0, records: 0, blobs: 0, attention: 0 } };

function setup(report: DrainReport = idle) {
	const page = { hidden: false, online: true, now: 1000 };
	const log: string[] = [];
	const listeners = new Map<string, () => void>();
	const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
	const state = { report };
	const runner: Runner = {
		running: false,
		drain: async () => (log.push('drain'), state.report),
		stop: () => void log.push('stop')
	};
	const detach = runInForeground(runner, {
		visible: () => !page.hidden,
		online: () => page.online,
		now: () => page.now,
		listen: (event, fn) => {
			listeners.set(event, fn);
			return () => listeners.delete(event);
		},
		timer: (ms, fn) => {
			const timer = { at: page.now + ms, fn, cancelled: false };
			timers.push(timer);
			return () => void (timer.cancelled = true);
		}
	});
	const fire = async (event: string) => {
		listeners.get(event)?.();
		await new Promise((r) => setTimeout(r, 0));
	};
	return { page, log, listeners, timers, state, detach, fire };
}

describe('runInForeground', () => {
	it('drains at once when the page is visible and online', async () => {
		const s = setup();
		await s.fire('none');
		expect(s.log).toEqual(['drain']);
	});

	it('does not drain while hidden or offline', async () => {
		const s = setup();
		s.log.length = 0;
		s.page.hidden = true;
		await s.fire('online');
		s.page.hidden = false;
		s.page.online = false;
		await s.fire('visible');
		expect(s.log).toEqual([]);
	});

	it('stops the runner when the page is hidden, drains when it comes back', async () => {
		const s = setup();
		s.log.length = 0;
		s.page.hidden = true;
		await s.fire('hidden');
		expect(s.log).toEqual(['stop']);
		s.page.hidden = false;
		await s.fire('visible');
		expect(s.log).toEqual(['stop', 'drain']);
	});

	it('drains when the network returns', async () => {
		const s = setup();
		s.log.length = 0;
		await s.fire('online');
		expect(s.log).toEqual(['drain']);
	});

	it('drains again when a scheduled retry falls due', async () => {
		const s = setup({ ...idle, stopped: 'waiting', waitUntil: 4000 });
		await s.fire('none');
		expect(s.timers).toHaveLength(1);
		expect(s.timers[0].at).toBe(4000);
		s.state.report = idle;
		s.log.length = 0;
		s.timers[0].fn();
		await s.fire('none');
		expect(s.log).toEqual(['drain']);
		expect(s.timers).toHaveLength(1);
	});

	it('drops the timer when hidden and stops listening when detached', async () => {
		const s = setup({ ...idle, stopped: 'waiting', waitUntil: 4000 });
		await s.fire('none');
		s.page.hidden = true;
		await s.fire('hidden');
		expect(s.timers[0].cancelled).toBe(true);
		s.detach();
		expect(s.listeners.size).toBe(0);
	});

	it('drains on demand through the returned function: after an edit, say', async () => {
		const s = setup();
		await s.fire('none');
		s.log.length = 0;
		s.detach.kick();
		await s.fire('none');
		expect(s.log).toEqual(['drain']);
	});
});
