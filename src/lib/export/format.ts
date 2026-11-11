// Values as export formats write them: numbers without float noise, signed angles, lengths in feet
// and inches or metres, and CRIF's local dates and times. Pure: the time zone is passed in.

const M_PER_INCH = 0.0254;
const M_PER_FOOT = 0.3048;

/** A number in its shortest form, to `places` decimals at most. -0 is 0. */
export function trimNumber(n: number, places = 6): string {
	return String(Number(n.toFixed(places)) + 0);
}

/** "+10", "-5", "0": CRIF writes a plus on tilt and dutch. */
export function signed(n: number): string {
	const text = trimNumber(n);
	return n > 0 && text !== '0' ? `+${text}` : text;
}

/** Feet and inches, inches to the hundredth: 6' 3.5". Infinity as CRIF writes it. */
export function feetInches(m: number | 'inf'): string {
	if (m === 'inf') return 'Infinity';
	const hundredths = Math.round((Math.abs(m) / M_PER_INCH) * 100);
	const feet = Math.floor(hundredths / 1200);
	const inches = (hundredths % 1200) / 100;
	const sign = m < 0 && hundredths > 0 ? '-' : '';
	return `${sign}${feet}' ${trimNumber(inches, 2)}"`;
}

/** Metres to the millimetre, with the unit: 1.918 m. */
export function metresText(m: number | 'inf'): string {
	return m === 'inf' ? 'Infinity' : `${trimNumber(m, 3)} m`;
}

/** A length as a bare number for a spreadsheet or ALE: metres to the mm, or decimal feet. 'inf' stays. */
export function lengthNumber(m: number | 'inf', system: 'metric' | 'imperial'): string {
	if (m === 'inf') return 'inf';
	return system === 'metric' ? trimNumber(m, 3) : trimNumber(m / M_PER_FOOT, 4);
}

/** The local date and time parts of an ISO timestamp in `timeZone`. Undefined when it does not read. */
function localParts(iso: string, timeZone: string): Record<string, string> | undefined {
	const date = new Date(iso);
	if (iso === '' || Number.isNaN(date.getTime())) return undefined;
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(date);
	return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** YYYY/MM/DD 24HH:MM:SS in local time, as every CRIF timestamp. Empty when it does not read. */
export function crifTimestamp(iso: string, timeZone: string): string {
	const p = localParts(iso, timeZone);
	return p ? `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}` : '';
}

/** 24HH:MM:SS in local time, as CRIF's take start. */
export function crifTime(iso: string, timeZone: string): string {
	const p = localParts(iso, timeZone);
	return p ? `${p.hour}:${p.minute}:${p.second}` : '';
}

/** A model date, YYYY-MM-DD, as YYYY/MM/DD. */
export function crifDate(date: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
}
