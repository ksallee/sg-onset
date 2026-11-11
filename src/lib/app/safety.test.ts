import { describe, expect, it } from 'vitest';
import { backupSignals, DEFAULT_THRESHOLDS as T, type SignalInput } from '$lib/store/snapshots';
import { deviceOf, lineMessage, safety, showLine, span } from './safety';

const H = 3600_000;
const NOW = 1000 * H;

function signals(rest: Partial<SignalInput> = {}) {
	return backupSignals(
		{ seq: 10, lastSnapshot: { at: NOW - 60_000, seq: 10 }, offDevice: {}, queue: { entries: 0, records: 0 }, persisted: true, ...rest },
		NOW
	);
}
const aged = (ms: number, records = 3) => signals({ queue: { entries: 7, records, oldest: NOW - ms } });

describe('safety', () => {
	it('is ok before the first read', () => {
		expect(safety(undefined)).toEqual({ level: 'ok', entries: 0, dismissible: false });
	});

	it('is ok with everything off the device, and says when the last copy left', () => {
		expect(safety(signals({ offDevice: { sync: NOW - 2 * H } }))).toEqual({ level: 'ok', entries: 0, sinceOffDeviceMs: 2 * H, dismissible: false });
	});

	it('follows the thresholds of the signals module', () => {
		expect(safety(aged(T.remindAfterMs - 1)).level).toBe('ok');
		expect(safety(aged(T.remindAfterMs)).level).toBe('remind');
		expect(safety(aged(T.warnAfterMs - 1)).level).toBe('remind');
		expect(safety(aged(T.warnAfterMs)).level).toBe('warn');
	});

	it('counts entries, not changes, and how long the oldest waited', () => {
		expect(safety(aged(5 * H, 12))).toEqual({ level: 'remind', entries: 12, sinceMs: 5 * H, dismissible: true });
	});

	it('cannot be dismissed at warn', () => {
		expect(safety(aged(30 * H)).dismissible).toBe(false);
	});

	it('leaves the other reasons to Settings: no line for a missing promise to keep the data alone', () => {
		const s = signals({ persisted: false, queue: { entries: 1, records: 1, oldest: NOW - 60_000 } });
		expect(s.severity).toBe('remind');
		expect(safety(s).level).toBe('ok');
	});
});

describe('showLine', () => {
	const remind = safety(aged(5 * H));
	const warn = safety(aged(30 * H));
	it('shows nothing when ok', () => {
		expect(showLine(safety(signals()), { focus: false, dismissed: false })).toBe(false);
	});
	it('shows remind until dismissed, warn always', () => {
		expect(showLine(remind, { focus: false, dismissed: false })).toBe(true);
		expect(showLine(remind, { focus: false, dismissed: true })).toBe(false);
		expect(showLine(warn, { focus: false, dismissed: true })).toBe(true);
	});
	it('never shows over a focus page: the take screen keeps its room', () => {
		expect(showLine(warn, { focus: true, dismissed: false })).toBe(false);
	});
});

describe('lineMessage', () => {
	it('says how many entries are only here, and for how long', () => {
		expect(lineMessage(safety(aged(5 * H, 12)), 'ipad')).toEqual({ key: 'safety.local.ipad', params: { n: 12 }, span: { key: 'safety.span.hours', params: { n: 5 } } });
		expect(lineMessage(safety(aged(5 * H, 1)), 'device')).toEqual({ key: 'safety.local.one.device', params: { n: 1 }, span: { key: 'safety.span.hours', params: { n: 5 } } });
	});
	it('names the last copy off the device when ok, for the sync detail', () => {
		expect(lineMessage(safety(signals({ offDevice: { sync: NOW - 2 * H } })), 'ipad')).toEqual({ key: 'safety.last.ipad', params: {}, span: { key: 'time.hours', params: { n: 2 } } });
	});
	it('says nothing when ok with no copy off the device yet', () => {
		expect(lineMessage(safety(signals()), 'ipad')).toBeUndefined();
	});
});

describe('span', () => {
	it('is minutes, then hours, then days, rounded down', () => {
		expect(span(30_000)).toEqual({ key: 'safety.span.minutes', params: { n: 1 } });
		expect(span(59 * 60_000)).toEqual({ key: 'safety.span.minutes', params: { n: 59 } });
		expect(span(H)).toEqual({ key: 'safety.span.hours', params: { n: 1 } });
		expect(span(47 * H)).toEqual({ key: 'safety.span.days', params: { n: 1 } });
		expect(span(23 * H + 59 * 60_000)).toEqual({ key: 'safety.span.hours', params: { n: 23 } });
	});
});

describe('deviceOf', () => {
	it('knows an iPad by its name, or as iPadOS desktop Safari with touch', () => {
		expect(deviceOf({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBe('ipad');
		expect(deviceOf({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', maxTouchPoints: 5 })).toBe('ipad');
	});
	it('says "device" elsewhere', () => {
		expect(deviceOf({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe('device');
		expect(deviceOf({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 })).toBe('device');
		expect(deviceOf({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBe('device');
	});
});
