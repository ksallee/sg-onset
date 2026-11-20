// The golden lines below were written by hand from the CRIF v1.1 field table: the column names in
// the table's order, strings in quotes and bare numbers, timestamps as YYYY/MM/DD 24HH:MM:SS in
// local time, focus and height in feet and inches, multi-selects split by vertical tabs.
import { describe, expect, it } from 'vitest';
import { CRIF_EXTRA_COLUMNS, CRIF_NEVER_FILLED, crifCsv, crifMissing, crifRecords, exportCrif } from './crif';
import { flatten } from './selection';
import { input, kindLabel, s42A, t42A1A, t42A1B } from './testData';
import { uuidV5 } from './uuid';

const SPEC_HEADER = [
	'Job', 'CRIF Version', 'Unique Slate ID', 'SlatesUUID', 'Slate', 'Camera Letter', 'VFX Shot', 'Scene Number', 'Shoot Day',
	'Shoot Timestamp', 'Shot Description', 'Unit', 'Element Type', 'VFX Work', 'Notes', 'Set Media', 'Set Location',
	'Set Location Position', 'Script Location', 'Script Time', 'Interior Exterior', 'Wrangler', 'Stereo Rig Orientation',
	'Stereo Thru Cam Eye', 'Camera Head', 'Camera Head Right', 'Camera Move Description', 'Camera Body', 'Camera Body Right',
	'Camera Mount', 'Characters', 'Props', 'Film Stock', 'ASA', 'HDRI Filename', 'White Balance', 'Creation Date',
	'Modification Date', 'Tk Take', 'Tk TakesUUID', 'Tk Filter', 'Tk Focal Length', 'Tk Focal Length End', 'Tk FPS',
	'Tk Lens Focus', 'Tk Lens Focus End', 'Tk Lens Height', 'Tk Lens Height End', 'Tk Lens ID', 'Tk Lens Serial Num',
	'Tk Lens Serial Num Right', 'Tk Notes', 'Tk Roll', 'Tk Shutter Angle', 'Tk Start Time Of Take', 'Tk Stereo Convergence',
	'Tk Stereo IA', 'Tk Stop', 'Tk Camera Tilt', 'Tk Camera Tilt End', 'Tk Camera Dutch', 'Tk Camera Dutch End',
	'Tk Clip Num', 'Tk Timecode', 'Tk Creation Date', 'Tk Modification Date'
];

const VT = '\v';
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** 42A, camera A, take 1: every value we hold. */
const ROW_A1 = [
	q('Night Train'), '1.1', '1', q(uuidV5(s42A.id, 'csA')), q('42A'), q('A'), q('NT_042_010, NT_042_020'), q('42'), '3',
	q('2026/11/10 14:15:30'), q('Wide on the platform'), q('Main'), q('Plate'), q(''), q('Rain, "light"'),
	q(`Balls${VT}HDRI${VT}Photos${VT}Witness Cam${VT}Colour Chart`), q('Stage 4'),
	q(''), q(''), q('Magic Hr'), q('Ext'), q('Ana Ruiz'), q(''),
	q(''), q(''), q(''), q(''), q('ARRI'), q(''),
	q(''), q(''), q(''), q(''), q('800'), q('LS1_dusk.exr'), q('5600K'), q('2026/11/10 18:00:00'),
	q(''), q('1'), q(t42A1A.id), q('ND.6 Pola'), q('32'), q('32'), q('23.976'),
	q(`10' 0"`), q(`6' 3.5"`), q(`3' 11.24"`), q(`3' 11.24"`), q('S4/i 32mm'), q('CK32-001'),
	q(''), q(`Best${VT}performance`), q('A001'), q('180'), q('14:15:30'), q(''),
	q(''), q('T2.8'), q('+10'), q('-5'), q('+2'), q('+2'),
	q('A001C003'), q('14:39:39:09'), q(''), q('')
].join(',');

/** 42A, camera B, take 1: a zoom that moved; much left empty. */
const ROW_B1 = [
	q('Night Train'), '1.1', '2', q(uuidV5(s42A.id, 'csB')), q('42A'), q('B'), q('NT_042_010, NT_042_020'), q('42'), '3',
	q('2026/11/10 14:15:31'), q('Wide on the platform'), q('Main'), q('Plate'), q(''), q('Rain, "light"'),
	q(`Balls${VT}HDRI${VT}Witness Cam${VT}Colour Chart`), q('Stage 4'),
	q(''), q(''), q('Magic Hr'), q('Ext'), q('Ana Ruiz'), q(''),
	q(''), q(''), q(''), q(''), q('Sony'), q(''),
	q(''), q(''), q(''), q(''), q(''), q('LS1_dusk.exr'), q(''), q('2026/11/10 18:00:00'),
	q(''), q('1'), q('t42A1B'), q(''), q('85'), q('150'), q('24'),
	q(''), q(''), q(''), q(''), q('Optimo 24-290'), q('ANG-7'),
	q(''), q(''), q('B001'), q(''), q('14:15:31'), q(''),
	q(''), q(''), q(''), q(''), q(''), q(''),
	q(''), q(''), q(''), q('')
].join(',');

const options = { timeZone: 'America/Los_Angeles', now: '2026-11-11T02:00:00.000Z', extras: false } as const;
const rows = () => flatten(input()).filter((r) => r.take.id === t42A1A.id || r.take.id === t42A1B.id);

describe('crifCsv', () => {
	it('matches the hand-written golden file', () => {
		const expected = [SPEC_HEADER.map(q).join(','), ROW_A1, ROW_B1].join('\r\n') + '\r\n';
		expect(crifCsv(crifRecords(rows(), options))).toBe(expected);
	});

	it('writes the header in the order of the spec table, every column present', () => {
		const header = crifCsv(crifRecords([], options)).split('\r\n')[0];
		expect(header).toBe(SPEC_HEADER.map(q).join(','));
	});

	it('writes lengths in metres on request', () => {
		const [a1] = crifRecords(rows(), { ...options, lengths: 'metric' });
		expect(a1.values['Tk Lens Focus']).toBe('3.048 m');
		expect(a1.values['Tk Lens Height']).toBe('1.2 m');
	});

	it('writes infinity for a focus at infinity', () => {
		const data = rows();
		data[0] = { ...data[0], take: { ...data[0].take, focusDistance: { m: 'inf' } } };
		expect(crifRecords(data, options)[0].values['Tk Lens Focus']).toBe('Infinity');
	});

	it('repeats the start in the end column when the value did not change', () => {
		const data = rows();
		data[0] = { ...data[0], take: { ...data[0].take, focusDistanceEnd: undefined } };
		expect(crifRecords(data, options)[0].values['Tk Lens Focus End']).toBe(`10' 0"`);
	});

	it('groups a slate by camera, then take, so each CRIF slate is one run of rows', () => {
		const all = crifRecords(flatten(input(), { slateFrom: '42A', slateTo: '42A' }), options);
		expect(all.map((r) => `${r.values['Camera Letter']}${r.values['Tk Take']}`)).toEqual(['A1', 'A2', 'A10', 'B1', 'B2']);
		expect(new Set(all.map((r) => r.values['SlatesUUID'])).size).toBe(2);
		expect(all.map((r) => r.values['Unique Slate ID'])).toEqual(['1', '1', '1', '2', '2']);
	});

	it('takes the Unique Slate ID from the caller when given', () => {
		const ids = { [`${s42A.id}:csA`]: 154 };
		expect(crifRecords(rows(), { ...options, slateNumbers: ids })[0].values['Unique Slate ID']).toBe('154');
	});

	it('appends our own columns, take ones prefixed Tk, when extras are on', () => {
		const records = crifRecords(rows(), { ...options, extras: true });
		const header = crifCsv(records).split('\r\n')[0].split(',').map((c) => c.slice(1, -1));
		expect(header.slice(0, SPEC_HEADER.length)).toEqual(SPEC_HEADER);
		const extra = header.slice(SPEC_HEADER.length);
		for (const c of extra.filter((c) => !['Shoot Date', 'Setup', 'Lighting Setup', 'Set References', 'Camera Model', 'Camera Serial Num'].includes(c))) expect(c.startsWith('Tk ')).toBe(true);
		const a1 = records[0].values;
		expect(a1['Tk End Time Of Take']).toBe('14:16:10');
		expect(a1['Tk Circled']).toBe('Yes');
		expect(a1['Tk Timecode End']).toBe('14:39:59:10');
		expect(a1['Shoot Date']).toBe('2026/11/10');
		expect(a1['Tk Photos']).toBe('2');
	});

	// Kevin, 2026-11-17 (#89): photos only. CRIF has no column for a video or an audio note.
	it('counts photos only in Tk Photos and Set Media, never a video or an audio note', () => {
		const data = { ...input(), audioNotes: [{ id: 'an1', takeId: t42A1A.id, capturedAt: '2026-11-10T22:30:00.000Z' }] };
		const records = crifRecords(flatten(data, { shootDayIds: ['d3'] }), { ...options, extras: true, videos: ['st1'] });
		const a1 = records.find((r) => r.takeId === t42A1A.id)!.values;
		expect(a1['Tk Photos']).toBe('1');
		expect(a1['Set Media'].split(VT)).toContain('Photos');
		const onlyVideos = crifRecords(flatten(data, { shootDayIds: ['d3'] }), { ...options, extras: true, videos: ['st1', 'st2', 'st3'] });
		const v1 = onlyVideos.find((r) => r.takeId === t42A1A.id)!.values;
		expect(v1['Tk Photos']).toBe('');
		expect(v1['Set Media'].split(VT)).not.toContain('Photos');
	});

	it('lists the set references of the slate in our own column, one per vertical tab, in the order logged', () => {
		const [a1, b1] = crifRecords(rows(), { ...options, extras: true, kindLabel });
		const want = `Lidar scan: Scan 01${VT}HDRI 360: HDRI_0412 (Ricoh Theta Z1, A003, ×7, Noon sun)`;
		expect(a1.values['Set References']).toBe(want);
		expect(b1.values['Set References']).toBe(want);
		// Without labels, the kind is written as stored.
		expect(crifRecords(rows(), { ...options, extras: true })[0].values['Set References']).toBe(`lidarScan: Scan 01${VT}hdri360: HDRI_0412 (Ricoh Theta Z1, A003, ×7, Noon sun)`);
		const none = crifRecords(flatten(input(), { slateFrom: '9', slateTo: '9' }), { ...options, extras: true, kindLabel });
		expect(none[0].values['Set References']).toBe('');
	});

	it('writes the take type in our column, Main for a take with none', () => {
		const shoot = input();
		shoot.takes = shoot.takes.map((t) => (t.id === t42A1A.id ? { ...t, takeType: 'cleanPlate' } : t.id === t42A1B.id ? { ...t, takeType: 'ballsAndChart' } : t));
		const records = crifRecords(flatten(shoot), { ...options, extras: true });
		const type = (id: string) => records.find((r) => r.takeId === id)!.values['Tk Type'];
		expect(type(t42A1A.id)).toBe('Clean Plate');
		expect(type(t42A1B.id)).toBe('Balls and Chart');
		expect(records.filter((r) => r.takeId !== t42A1A.id && r.takeId !== t42A1B.id).map((r) => r.values['Tk Type'])).toEqual(expect.arrayContaining(['Main']));
		expect(crifRecords(flatten(shoot), { ...options, extras: false })[0].values['Tk Type']).toBeUndefined();
	});

	it('writes the plates at the tail in our column after the type, split by vertical tabs, empty for none', () => {
		const shoot = input();
		shoot.takes = shoot.takes.map((t) => (t.id === t42A1A.id ? { ...t, takeTail: ['cleanPlate', 'ballsAndChart'] } : t.id === t42A1B.id ? { ...t, takeTail: ['cleanPlate'] } : t));
		const records = crifRecords(flatten(shoot), { ...options, extras: true });
		const tail = (id: string) => records.find((r) => r.takeId === id)!.values['Tk Tail'];
		expect(tail(t42A1A.id)).toBe(`Clean Plate${VT}Balls and Chart`);
		expect(tail(t42A1B.id)).toBe('Clean Plate');
		expect(records.filter((r) => r.takeId !== t42A1A.id && r.takeId !== t42A1B.id).every((r) => r.values['Tk Tail'] === '')).toBe(true);
		const names = CRIF_EXTRA_COLUMNS.map((c) => c.name);
		expect(names.indexOf('Tk Tail')).toBe(names.indexOf('Tk Type') + 1);
		expect(crifRecords(flatten(shoot), { ...options, extras: false })[0].values['Tk Tail']).toBeUndefined();
	});
});

describe('crifMissing', () => {
	it('lists the required columns a row leaves empty, in column order', () => {
		const [a1, b1] = crifRecords(rows(), options);
		expect(crifMissing(a1)).toEqual(['VFX Work', 'Script Location', 'Camera Head', 'Film Stock']);
		expect(crifMissing(b1)).toEqual(['VFX Work', 'Script Location', 'Camera Head', 'Film Stock', 'ASA', 'Tk Lens Focus', 'Tk Lens Focus End', 'Tk Shutter Angle', 'Tk Stop']);
	});

	it('names the required columns SG OnSet has no field for', () => {
		expect(CRIF_NEVER_FILLED).toEqual(['VFX Work', 'Script Location', 'Camera Head', 'Film Stock']);
	});
});

describe('exportCrif', () => {
	it('gives the text and the gaps per take', () => {
		const out = exportCrif(rows(), options);
		expect(out.text.startsWith('"Job","CRIF Version"')).toBe(true);
		expect(out.missing).toEqual([
			{ takeId: t42A1A.id, columns: [] },
			{ takeId: 't42A1B', columns: ['ASA', 'Tk Lens Focus', 'Tk Lens Focus End', 'Tk Shutter Angle', 'Tk Stop'] }
		]);
	});
});
