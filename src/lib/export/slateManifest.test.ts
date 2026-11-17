import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/model/csv';
import { flatten, selectSlates } from './selection';
import { MANIFEST_COLUMNS, slateManifest } from './slateManifest';
import { day3, input, kindLabel, project } from './testData';
import { wrapPlan, type PhotoBlob, type SlateFolder } from './wrapPackage';

const blobs: PhotoBlob[] = [
	{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 100, createdAt: 2 },
	{ id: 'b2', recordId: 'st2', type: 'image/heic', size: 200, createdAt: 1 },
	{ id: 'b3', recordId: 'st3', type: 'image/jpeg', size: 300, createdAt: 4, prunedAt: 9 }
];

function folders(photos = true): SlateFolder[] {
	const all = input();
	all.references[1] = { ...all.references[1], notes: 'Noon sun,\nhigh cloud' };
	const filters = { shootDayIds: ['d3'] };
	return wrapPlan(flatten(all, filters), { project, shootDays: [day3], blobs, photos, slates: selectSlates(all, filters), references: all.references }).slates;
}
const s42A = () => folders()[2];
const read = (text: string) => parseCsv(text.replace(/^﻿/, ''), ',').filter((r) => !(r.length === 1 && r[0] === ''));

describe('slateManifest', () => {
	it('has fixed English headers, a byte order mark for Excel, and CRLF line ends', () => {
		const text = slateManifest(s42A(), kindLabel);
		expect(text.startsWith('﻿What,Take,Camera,Clip,Roll,Timecode in,Timecode out,Kind,Name,Path,Device,Card or roll,Count,Notes\r\n')).toBe(true);
		expect(text.endsWith('\r\n')).toBe(true);
		expect(read(text)[0]).toEqual([...MANIFEST_COLUMNS]);
	});

	it('lists each take, then its photos, each photo with its take’s clip, roll and timecode', () => {
		const rows = read(slateManifest(s42A(), kindLabel)).slice(1);
		expect(rows.slice(0, 3)).toEqual([
			['Take', '1', 'A', 'A001C003', 'A001', '14:39:39:09', '14:39:59:10', '', '', '', '', '', '', ''],
			['Photo', '1', 'A', 'A001C003', 'A001', '14:39:39:09', '14:39:59:10', '', '42A-A-reference-1.heic', '42A/42A-A-reference-1.heic', '', '', '', 'Ball pass'],
			['Photo', '1', 'A', 'A001C003', 'A001', '14:39:39:09', '14:39:59:10', '', '42A-A-reference-2.jpg', '42A/42A-A-reference-2.jpg', '', '', '', '']
		]);
	});

	it('lists every take in order, even one with nothing filled, and leaves out a photo whose file is not in the package', () => {
		const rows = read(slateManifest(s42A(), kindLabel)).slice(1);
		expect(rows.filter((r) => r[0] !== 'Reference').map((r) => [r[0], r[1], r[2], r[4]])).toEqual([
			['Take', '1', 'A', 'A001'],
			['Photo', '1', 'A', 'A001'],
			['Photo', '1', 'A', 'A001'],
			['Take', '1', 'B', 'B001'],
			['Take', '2', 'A', ''],
			['Take', '2', 'B', ''],
			['Take', '10', 'A', '']
		]);
		expect(rows.map((r) => r[9])).not.toContain('42A/42A-A-reference-3.jpg');
	});

	it('lists the references last, in the order logged, each with the folder that waits for it, from the package root', () => {
		const rows = read(slateManifest(s42A(), kindLabel)).slice(1);
		expect(rows.filter((r) => r[0] === 'Reference')).toEqual([
			['Reference', '', '', '', '', '', '', 'Lidar scan', 'Scan 01', '42A/lidar-scan/Scan-01/', '', '', '', ''],
			['Reference', '', '', '', '', '', '', 'HDRI 360', 'HDRI_0412', '42A/hdri-360/HDRI_0412/', 'Ricoh Theta Z1', 'A003', '7', 'Noon sun, high cloud']
		]);
	});

	it('lists the takes and references alone when the photos are left out', () => {
		const rows = read(slateManifest(folders(false)[2], kindLabel)).slice(1);
		expect(rows.map((r) => r[0])).toEqual(['Take', 'Take', 'Take', 'Take', 'Take', 'Reference', 'Reference']);
	});

	it('lists a slate with a take and nothing else', () => {
		expect(read(slateManifest(folders()[0], kindLabel)).slice(1)).toEqual([['Take', '1', '', '', '', '', '', '', '', '', '', '', '', '']]);
	});

	it('keeps a cell a spreadsheet would run as a formula as text', () => {
		const folder = s42A();
		folder.references[0] = { ...folder.references[0], reference: { ...folder.references[0].reference, notes: '=HYPERLINK("x")' } };
		const rows = read(slateManifest(folder, kindLabel)).slice(1);
		expect(rows.find((r) => r[8] === 'Scan 01')?.[13]).toBe(`'=HYPERLINK("x")`);
	});
});
