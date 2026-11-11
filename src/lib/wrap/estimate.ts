// How big a wrap package will be, before it is built, and what to say about it. The zip stores
// files as they are (photos do not shrink), so its size is the files plus the zip's headers. Pure.

/** Past this a package is too big for Mail: AirDrop or Files then. */
export const LARGE_BYTES = 250e6;
/** Past this the build is long and an iPad may run short: suggest fewer days or no photos. */
export const HUGE_BYTES = 2e9;
/** Held in memory (no private file system), a package is huge sooner. */
export const HUGE_IN_MEMORY_BYTES = 500e6;
/** Room to leave on the device beyond the zip itself. */
const ROOM_MARGIN = 1.1;

const ZIP64_FROM = 0xffffffff;
const encoder = new TextEncoder();

/**
 * The size of a zip of these entries as client-zip writes it: per entry a local header (30 bytes
 * and the name), the data, a data descriptor (16), a central header (46 and the name); zip64
 * records past 4 GB; the end record (22).
 */
export function zipSize(entries: readonly { path: string; size: number }[]): number {
	let total = 22;
	let offset = 0;
	for (const e of entries) {
		const name = encoder.encode(e.path).length;
		const big = e.size >= ZIP64_FROM || offset >= ZIP64_FROM;
		const entry = 30 + name + e.size + (big ? 24 : 16) + 46 + name + (big ? 28 : 0);
		offset += entry;
		total += entry;
	}
	if (offset >= ZIP64_FROM) total += 56 + 20;
	return total;
}

export type SizeVerdict = {
	level: 'ok' | 'large' | 'huge';
	/** The device has too little free room for the zip. */
	noRoom: boolean;
	/** The browser cannot write the zip to disk: it is held in memory. */
	inMemory: boolean;
};

export function sizeVerdict(bytes: number, where: { onDisk: boolean; free?: number }): SizeVerdict {
	const huge = where.onDisk ? HUGE_BYTES : HUGE_IN_MEMORY_BYTES;
	return {
		level: bytes > huge ? 'huge' : bytes > LARGE_BYTES ? 'large' : 'ok',
		noRoom: where.onDisk && where.free !== undefined && where.free < bytes * ROOM_MARGIN,
		inMemory: !where.onDisk
	};
}
