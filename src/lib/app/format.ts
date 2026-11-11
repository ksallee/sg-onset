// How dates, sizes and ages are shown. Pure: the clock is passed in. English forms for now.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/** The local date of `now` as the model stores a date: YYYY-MM-DD. */
export function today(now: Date): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The date `days` after a stored date (before, when negative). */
export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const moved = new Date(Date.UTC(y, m - 1, d + days));
	return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** A stored date as "Wed 11 Nov 2026". Anything that is not a date comes back as it is. */
export function formatDate(date: string | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
	if (!m) return date ?? '';
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A timestamp as a local time of day, "14:05". */
export function formatTime(timestamp: string | undefined): string {
	const ms = Date.parse(timestamp ?? '');
	if (Number.isNaN(ms)) return '';
	const d = new Date(ms);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Bytes as "512 B", "12 KB", "3.4 MB", "1.2 GB": decimal units, as iOS shows storage. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let n = bytes;
	let u = 0;
	while (n >= 1000 && u < units.length - 1) {
		n /= 1000;
		u++;
	}
	const text = u < 2 || n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
	return `${text} ${units[u]}`;
}

/** How long ago `then` was, as a message key and its count: `time.now`, `.minutes`, `.hours`, `.days`. */
export function ago(then: number, now: number): { key: 'time.now' | 'time.minutes' | 'time.hours' | 'time.days'; params: { n: number } } {
	const minutes = Math.floor(Math.max(0, now - then) / 60_000);
	if (minutes < 1) return { key: 'time.now', params: { n: 0 } };
	if (minutes < 60) return { key: 'time.minutes', params: { n: minutes } };
	if (minutes < 60 * 24) return { key: 'time.hours', params: { n: Math.floor(minutes / 60) } };
	return { key: 'time.days', params: { n: Math.floor(minutes / (60 * 24)) } };
}

/** The file name of a backup made at `now`: sg-onset-2026-11-11-1530.zip. */
export function backupName(now: Date): string {
	return `sg-onset-${today(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}
