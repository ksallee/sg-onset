// When each shoot day was last handed over, kept on this device: a day id to a time in ms. And the
// line that says it: "Exported today 19:42". Pure; `wrap.svelte.ts` keeps it in localStorage.

import { formatDate, today } from '$lib/app/format';

export type ExportLog = Record<string, number>;

export const LOG_KEY = 'sg-onset.wrap.exports';

export function parseLog(text: string | null): ExportLog {
	if (!text) return {};
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return {};
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as ExportLog;
}

export function noteExport(log: ExportLog, dayIds: readonly string[], at: number): ExportLog {
	return { ...log, ...Object.fromEntries(dayIds.map((id) => [id, at])) };
}

export function lastExport(log: ExportLog, dayId: string): number | undefined {
	return log[dayId];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function exportedLine(at: number, now: Date): { key: 'wrap.exported.today' | 'wrap.exported.yesterday' | 'wrap.exported.on'; params: { time: string; date: string } } {
	const then = new Date(at);
	const time = `${pad(then.getHours())}:${pad(then.getMinutes())}`;
	const day = today(then);
	if (day === today(now)) return { key: 'wrap.exported.today', params: { time, date: '' } };
	const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	if (day === today(yesterday)) return { key: 'wrap.exported.yesterday', params: { time, date: '' } };
	return { key: 'wrap.exported.on', params: { time, date: formatDate(day) } };
}
