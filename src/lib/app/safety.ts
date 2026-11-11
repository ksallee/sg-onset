// The shell's one line about the safety of the data. Pure: the signals (store/snapshots/signals.ts)
// and the device are passed in. The line speaks of one thing only, the one a snapshot cannot help
// with: entries that exist only on this device. Its thresholds are the signals'. The other
// reasons (a bad snapshot, the browser's promise to keep the data) are for Settings.

import type { BackupSignals } from '$lib/store/snapshots';
import { ago } from './format';

export type Device = 'ipad' | 'device';

/**
 * - `ok`: nothing to say, but in the sync detail when the last copy left the device.
 * - `remind`: entries only here past the remind threshold. Quiet, dismissible for the session.
 * - `warn`: past the warn threshold. Warning style, never dismissed, links to the backup.
 */
export type SafetyLevel = 'ok' | 'remind' | 'warn';

export type Safety = {
	level: SafetyLevel;
	/** Entries with changes only on this device. */
	entries: number;
	/** How long the oldest of them has been only here. */
	sinceMs?: number;
	/** How long ago the last copy left the device: a full sync or an exported backup. */
	sinceOffDeviceMs?: number;
	dismissible: boolean;
};

export type Message = { key: string; params: Record<string, number> };

export function safety(signals: BackupSignals | undefined): Safety {
	if (!signals) return { level: 'ok', entries: 0, dismissible: false };
	const level: SafetyLevel = signals.reasons.includes('localOnlyDay') ? 'warn' : signals.reasons.includes('localOnly') ? 'remind' : 'ok';
	const { localOnly } = signals;
	return {
		level,
		entries: level === 'ok' ? 0 : localOnly.records,
		...(level !== 'ok' && localOnly.sinceMs !== undefined ? { sinceMs: localOnly.sinceMs } : {}),
		...(signals.sinceOffDeviceMs !== undefined ? { sinceOffDeviceMs: signals.sinceOffDeviceMs } : {}),
		dismissible: level === 'remind'
	};
}

/** Whether the shell shows the line over the page. Never on a focus page: there it is in the sync detail. */
export function showLine(s: Safety, where: { focus: boolean; dismissed: boolean }): boolean {
	if (where.focus || s.level === 'ok') return false;
	return s.level === 'warn' || !where.dismissed;
}

/** A length of time as "{n} min", "{n} h", "{n} d", rounded down, at least a minute. */
export function span(ms: number): Message & { key: `safety.span.${'minutes' | 'hours' | 'days'}` } {
	const minutes = Math.max(1, Math.floor(ms / 60_000));
	if (minutes < 60) return { key: 'safety.span.minutes', params: { n: minutes } };
	if (minutes < 60 * 24) return { key: 'safety.span.hours', params: { n: Math.floor(minutes / 60) } };
	return { key: 'safety.span.days', params: { n: Math.floor(minutes / (60 * 24)) } };
}

/** The line's words, as a message key, its count, and the span to put in as `{span}`. */
export function lineMessage(s: Safety, device: Device): (Message & { span: Message }) | undefined {
	if (s.level === 'ok') {
		if (s.sinceOffDeviceMs === undefined) return undefined;
		return { key: `safety.last.${device}`, params: {}, span: ago(0, s.sinceOffDeviceMs) };
	}
	return { key: s.entries === 1 ? `safety.local.one.${device}` : `safety.local.${device}`, params: { n: s.entries }, span: span(s.sinceMs ?? 0) };
}

/** An iPad by name, or iPadOS Safari asking for the desktop site: a Mac that has touch. */
export function deviceOf(nav: { userAgent: string; maxTouchPoints?: number }): Device {
	if (/\biPad\b/.test(nav.userAgent)) return 'ipad';
	if (/\bMacintosh\b/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1) return 'ipad';
	return 'device';
}
