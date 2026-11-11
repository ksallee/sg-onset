// A zip writer, stored entries only, synchronous. A snapshot taken inside a schema upgrade cannot
// wait on a stream: IndexedDB would commit the upgrade under it. `zipRead.ts` reads the result,
// and so does any unzip tool. No zip64: a snapshot holds rows, not photos. Pure.

import { crc32 } from '../crc32';

export type ZipFile = { name: string; data: Uint8Array };

function dosTime(date: Date): { time: number; date: number } {
	return {
		time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
		date: ((Math.max(1980, date.getUTCFullYear()) - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
	};
}

/** The zip of `files`, stored, as one byte array. */
export function writeZip(files: readonly ZipFile[], modified: Date): Uint8Array {
	const encoder = new TextEncoder();
	const stamp = dosTime(modified);
	const names = files.map((f) => encoder.encode(f.name));
	const crcs = files.map((f) => crc32(f.data));
	const localSize = files.reduce((sum, f, i) => sum + 30 + names[i].length + f.data.length, 0);
	const centralSize = names.reduce((sum, n) => sum + 46 + n.length, 0);
	const out = new Uint8Array(localSize + centralSize + 22);
	const v = new DataView(out.buffer);
	const offsets: number[] = [];
	let p = 0;

	files.forEach((file, i) => {
		offsets.push(p);
		v.setUint32(p, 0x04034b50, true);
		v.setUint16(p + 4, 20, true); // version needed
		v.setUint16(p + 6, 0x0800, true); // UTF-8 names
		v.setUint16(p + 8, 0, true); // stored
		v.setUint16(p + 10, stamp.time, true);
		v.setUint16(p + 12, stamp.date, true);
		v.setUint32(p + 14, crcs[i], true);
		v.setUint32(p + 18, file.data.length, true);
		v.setUint32(p + 22, file.data.length, true);
		v.setUint16(p + 26, names[i].length, true);
		v.setUint16(p + 28, 0, true);
		out.set(names[i], p + 30);
		out.set(file.data, p + 30 + names[i].length);
		p += 30 + names[i].length + file.data.length;
	});

	const centralStart = p;
	files.forEach((file, i) => {
		v.setUint32(p, 0x02014b50, true);
		v.setUint16(p + 4, 20, true); // made by
		v.setUint16(p + 6, 20, true); // version needed
		v.setUint16(p + 8, 0x0800, true);
		v.setUint16(p + 10, 0, true);
		v.setUint16(p + 12, stamp.time, true);
		v.setUint16(p + 14, stamp.date, true);
		v.setUint32(p + 16, crcs[i], true);
		v.setUint32(p + 20, file.data.length, true);
		v.setUint32(p + 24, file.data.length, true);
		v.setUint16(p + 28, names[i].length, true);
		// extra, comment, disk, internal and external attributes: zero.
		v.setUint32(p + 42, offsets[i], true);
		out.set(names[i], p + 46);
		p += 46 + names[i].length;
	});

	v.setUint32(p, 0x06054b50, true);
	v.setUint16(p + 8, files.length, true);
	v.setUint16(p + 10, files.length, true);
	v.setUint32(p + 12, p - centralStart, true);
	v.setUint32(p + 16, centralStart, true);
	return out;
}
