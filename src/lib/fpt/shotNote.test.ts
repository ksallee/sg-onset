import { describe, expect, it } from 'vitest';
import { tk } from '$lib/i18n/messages';
import { addedSince, capturedText, noteBody, noteReads, noteRecordsOf, noteSubject, parseCaptured, replyBody, shotCapture, type NoteRecords } from './shotNote';
import { RESOLUTION } from './testkit';

// Rows in the shapes Flow PT answers a `_search` (findings/004, field_types/entity.md,
// field_types/multi_entity.md), with the field names Set Up Fields makes (RESOLUTION).
const link = (type: string, id: number) => ({ type, id, name: 'x' });
const slateRow = (id: number, code: string, setShots: number[]) => ({
	id,
	attributes: { code },
	relationships: { sg_set_shots: { data: setShots.map((s) => link('CustomEntity22', s)) } }
});
const takeRow = (id: number, slate: number, take: string, extra: { type?: string; tail?: string; photos?: number[] } = {}) => ({
	id,
	attributes: { code: take, sg_take_type: extra.type ?? null, sg_take_tail: extra.tail ?? null },
	relationships: { sg_slate: { data: link('Slate', slate) }, sg_photos: { data: (extra.photos ?? []).map((p) => link('Attachment', p)) } }
});
const referenceRow = (id: number, slate: number, kind: string, name: string) => ({
	id,
	attributes: { code: name, sg_kind: kind },
	relationships: { sg_slate: { data: link('Slate', slate) } }
});
const setShotRow = (id: number, shots: number[]) => ({ id, attributes: {}, relationships: { sg_shots: { data: shots.map((s) => link('Shot', s)) } } });
const fileRow = (id: number, filename: string) => ({ id, attributes: { filename } });

const SHOT = { id: 7, code: 'SMP_042_0010' };
const OTHER = { id: 8, code: 'SMP_042_0020' };

/** Two Set Shots of the Shot, three slates (one for another Shot), takes on two cameras, references, photos. */
function records(): NoteRecords {
	return noteRecordsOf(RESOLUTION, {
		setShots: [setShotRow(300, [7]), setShotRow(301, [7, 8]), setShotRow(302, [8])],
		slates: [slateRow(10, '42B', [301]), slateRow(11, '42A', [300]), slateRow(12, '43', [302])],
		takes: [
			takeRow(100, 11, '1', { photos: [500, 501] }),
			takeRow(101, 11, '2'),
			// Take 3 on cameras A and B: one take number.
			takeRow(102, 11, '3', { tail: 'ballsAndChart' }),
			takeRow(103, 11, '3', { tail: 'ballsAndChart', photos: [502] }),
			takeRow(104, 11, '10', { type: 'cleanPlate' }),
			takeRow(105, 10, '1'),
			takeRow(106, 10, '2', { tail: 'cleanPlate', photos: [503, 504] }),
			takeRow(107, 12, '1', { photos: [505] })
		],
		references: [
			referenceRow(200, 11, 'witnessCamera', 'WIT_A001'),
			referenceRow(201, 11, 'hdri360', 'HDRI_0413'),
			referenceRow(202, 10, 'hdri360', 'HDRI_0412'),
			referenceRow(203, 10, 'Drone survey', 'DRONE_01'),
			referenceRow(204, 12, 'lidarScan', 'SCAN_9')
		],
		files: [
			fileRow(500, 'onset_aaaa-1_b1.jpg'),
			fileRow(501, 'onset_aaaa-1_b1-annotated.jpg'),
			// The same photo sent twice: one photo.
			fileRow(502, 'onset_cccc-3_b3.jpg'),
			fileRow(503, 'onset_dddd-4_b4.jpg'),
			fileRow(504, 'onset_dddd-4_b4.jpg'),
			fileRow(505, 'onset_eeee-5_b5.jpg')
		]
	});
}

describe('noteReads', () => {
	it('asks each type for the fields the Note needs, by their names on the site', () => {
		const reads = noteReads(RESOLUTION);
		expect(reads.setShot).toEqual(['sg_shots']);
		expect(reads.slate).toEqual(['code', 'sg_set_shots']);
		expect(reads.take).toEqual(expect.arrayContaining(['code', 'sg_take_type', 'sg_take_tail', 'sg_slate', 'sg_photos']));
		expect(reads.reference).toEqual(expect.arrayContaining(['code', 'sg_kind', 'sg_slate']));
		expect(reads.links).toEqual({ setShotShots: 'sg_shots', slateSetShots: 'sg_set_shots', takeSlate: 'sg_slate', takePhotos: 'sg_photos', referenceSlates: ['sg_slate'] });
	});
});

describe('shotCapture', () => {
	it('takes the slates whose Set Shots hold the Shot, and what was captured on them', () => {
		const capture = shotCapture(SHOT, records());
		expect(capture.slates).toEqual([
			{ slate: '42A', takes: ['1', '2', '3', '10'] },
			{ slate: '42B', takes: ['1', '2'] }
		]);
		expect(capture.elements).toEqual([
			{ type: 'cleanPlate', tail: false, takes: [{ slate: '42A', take: '10' }] },
			{ type: 'cleanPlate', tail: true, takes: [{ slate: '42B', take: '2' }] },
			{ type: 'ballsAndChart', tail: true, takes: [{ slate: '42A', take: '3' }] }
		]);
		expect(capture.references).toEqual([
			{ kind: 'hdri360', names: ['HDRI_0412', 'HDRI_0413'] },
			{ kind: 'witnessCamera', names: ['WIT_A001'] },
			{ kind: 'Drone survey', names: ['DRONE_01'] }
		]);
		// An annotated copy is the same photo; a photo sent twice is one.
		expect(capture.photos).toBe(3);
	});

	it('leaves out what was captured for another Shot only', () => {
		const capture = shotCapture(OTHER, records());
		expect(capture.slates.map((s) => s.slate)).toEqual(['42B', '43']);
		expect(capture.references.flatMap((r) => r.names)).toEqual(['HDRI_0412', 'SCAN_9', 'DRONE_01']);
		expect(capture.photos).toBe(2);
	});

	it('lists nothing for a Shot no Set Shot holds, or slates with nothing captured yet', () => {
		expect(shotCapture({ id: 99, code: 'X' }, records()).items).toEqual([]);
		const bare = noteRecordsOf(RESOLUTION, { setShots: [setShotRow(300, [7])], slates: [slateRow(11, '42A', [300])], takes: [], references: [], files: [] });
		expect(shotCapture(SHOT, bare).items).toEqual([]);
	});

	// #107: a lighting reference links every slate of its lighting setup. Counted once.
	it('counts a reference that links several of the slates once', () => {
		const rows = {
			setShots: [setShotRow(300, [7])],
			slates: [slateRow(10, '42A', [300]), slateRow(11, '42B', [300])],
			takes: [],
			references: [{ id: 200, attributes: { code: 'HDRI_0412', sg_kind: 'hdri360' }, relationships: { sg_slate: { data: link('Slate', 10) }, sg_slates: { data: [link('Slate', 10), link('Slate', 11)] } } }],
			files: []
		};
		const capture = shotCapture(SHOT, noteRecordsOf(RESOLUTION, rows, ['sg_slate', 'sg_slates']));
		expect(capture.references).toEqual([{ kind: 'hdri360', names: ['HDRI_0412'] }]);
		expect(capture.items).toEqual(['reference:200']);
	});

	it('gives what it lists as ids: a take number per slate, an element take, a reference, a photo', () => {
		expect(shotCapture(SHOT, records()).items).toEqual([
			'ballsAndChart.tail:11:3',
			'cleanPlate.tail:10:2',
			'cleanPlate:11:10',
			'photo:500',
			'photo:502',
			'photo:503',
			'reference:200',
			'reference:201',
			'reference:202',
			'reference:203',
			'take:10:1',
			'take:10:2',
			'take:11:1',
			'take:11:10',
			'take:11:2',
			'take:11:3'
		]);
	});
});

describe('the Note', () => {
	it('is titled by the Shot', () => {
		expect(noteSubject(shotCapture(SHOT, records()), tk)).toBe('Set data for SMP_042_0010');
	});

	it('lists the element takes by type first, then the takes by slate, the references, the photos', () => {
		expect(noteBody(shotCapture(SHOT, records()), tk)).toBe(
			[
				'What was shot on set for SMP_042_0010. SG OnSet updates this Note at each sync that adds to it.',
				'',
				'Elements',
				'Clean plate: 42A take 10',
				'Clean plate at the tail: 42B take 2',
				'Balls and chart at the tail: 42A take 3',
				'',
				'Takes',
				'Slate 42A: takes 1, 2, 3, 10',
				'Slate 42B: takes 1, 2',
				'',
				'References',
				'HDRI 360: HDRI_0412, HDRI_0413',
				'Witness camera: WIT_A001',
				'Drone survey: DRONE_01',
				'',
				'Photos: 3'
			].join('\n')
		);
	});

	it('leaves out a part with nothing in it, and says take for one', () => {
		const rows = { setShots: [setShotRow(300, [7])], slates: [slateRow(11, '42A', [300])], takes: [takeRow(100, 11, '1')], references: [], files: [] };
		expect(noteBody(shotCapture(SHOT, noteRecordsOf(RESOLUTION, rows)), tk)).toBe(
			['What was shot on set for SMP_042_0010. SG OnSet updates this Note at each sync that adds to it.', '', 'Takes', 'Slate 42A: take 1'].join('\n')
		);
	});
});

describe('what was added', () => {
	it('is what the Note did not list yet, said in a reply', () => {
		const before = shotCapture(SHOT, records()).items.filter((i) => !['take:11:10', 'cleanPlate:11:10', 'reference:201', 'photo:502', 'photo:503'].includes(i));
		const added = addedSince(shotCapture(SHOT, records()), before);
		expect(added.items).toEqual(['cleanPlate:11:10', 'photo:502', 'photo:503', 'reference:201', 'take:11:10']);
		expect(replyBody(added, tk)).toBe(['Added since the last update:', 'Clean plate: 42A take 10', 'Slate 42A: take 10', 'HDRI 360: HDRI_0413', '2 more photos'].join('\n'));
	});

	it('is nothing when the Note lists it all, whatever it listed that is gone', () => {
		const now = shotCapture(SHOT, records());
		expect(addedSince(now, [...now.items, 'take:11:99']).items).toEqual([]);
	});

	it('says one photo', () => {
		const now = shotCapture(SHOT, records());
		expect(replyBody(addedSince(now, now.items.filter((i) => i !== 'photo:500')), tk)).toBe(['Added since the last update:', '1 more photo'].join('\n'));
	});
});

describe('what the Note lists, kept on the Note', () => {
	it('is the ids in one line, and reads back, whatever the spacing', () => {
		const items = shotCapture(SHOT, records()).items;
		expect(capturedText(items)).toBe(items.join(' '));
		expect(parseCaptured(capturedText(items))).toEqual(items);
		expect(parseCaptured('  take:1:2 \n photo:3 ')).toEqual(['take:1:2', 'photo:3']);
		expect(parseCaptured(null)).toEqual([]);
		expect(parseCaptured(undefined)).toEqual([]);
	});

	it('spells a take number with spaces or colons so it stays one id', () => {
		const rows = { setShots: [setShotRow(300, [7])], slates: [slateRow(11, '42A', [300])], takes: [takeRow(100, 11, '4 pt:2')], references: [], files: [] };
		const items = shotCapture(SHOT, noteRecordsOf(RESOLUTION, rows)).items;
		expect(items).toEqual(['take:11:4%20pt%3A2']);
		expect(parseCaptured(capturedText(items))).toEqual(items);
	});
});
