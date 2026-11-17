import { describe, expect, it } from 'vitest';
import type { Clip } from './clips';
import { matchClips, matchCounts, withPicks, type MatchTake } from './match';

const utc = { offsetMinutes: () => 0 };
const at = (clock: string) => `2026-11-17T${clock}Z`;
const plus = (clock: string, seconds: number) => new Date(Date.parse(at(clock)) + seconds * 1000).toISOString();

/** A take on `camera` started at `clock` (UTC) that ran `seconds`. */
const take = (id: string, camera: string | undefined, clock?: string, seconds = 40): MatchTake => ({
	id,
	camera,
	...(clock ? { startedAt: at(clock), endedAt: plus(clock, seconds) } : {})
});

const frames = (tc: string, base = 24) => {
	const [h, m, s, f] = tc.split(/[:;]/).map(Number);
	return (h * 3600 + m * 60 + s) * base + f;
};
/** A clip at 24 fps from `start` to `end`, the last frame. */
const clip = (row: number, name: string, start?: string, end?: string, extra: Partial<Clip> = {}): Clip => ({
	row,
	name,
	roll: name.slice(0, 4),
	camera: name.slice(0, 1),
	rate: { num: 24, denom: 1 },
	dropFrame: false,
	...(start ? { start, startFrame: frames(start) } : {}),
	...(end ? { end, endFrame: frames(end) } : {}),
	...extra
});

const pairs = (matches: { row: number; takeId?: string; how?: string }[]) => matches.map((m) => [m.row, m.takeId ?? null, m.how ?? null]);

describe('matchClips by time of day', () => {
	it('matches each clip to the take on its camera that its timecode falls in', () => {
		const takes = [take('a1', 'A', '14:00:00'), take('b1', 'B', '14:00:01'), take('a2', 'A', '14:05:00'), take('b2', 'B', '14:05:00')];
		const clips = [
			clip(1, 'A001C001', '13:59:55:00', '14:00:42:10'),
			clip(2, 'A001C002', '14:04:58:00', '14:05:41:00'),
			clip(3, 'B001C001', '13:59:57:00', '14:00:43:00'),
			clip(4, 'B001C002', '14:04:59:00', '14:05:40:00')
		];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 'a1', 'time'],
			[2, 'a2', 'time'],
			[3, 'b1', 'time'],
			[4, 'b2', 'time']
		]);
	});

	it('reads the take stamps in the device time zone', () => {
		const takes = [take('a1', 'A', '13:00:00'), take('a2', 'A', '13:05:00')];
		const clips = [clip(1, 'A001C001', '14:05:01:00', '14:05:30:00'), clip(2, 'A001C002', '14:00:01:00', '14:00:30:00')];
		expect(pairs(matchClips(clips, takes, { offsetMinutes: () => 60 }))).toEqual([
			[1, 'a2', 'time'],
			[2, 'a1', 'time']
		]);
	});

	it('allows a camera that rolls before Start and runs past End, within the slack', () => {
		const takes = [take('a1', 'A', '14:00:00', 30)];
		expect(pairs(matchClips([clip(1, 'A001C001', '13:59:30:00', '13:59:46:00')], takes, utc))).toEqual([[1, 'a1', 'time']]);
		expect(pairs(matchClips([clip(1, 'A001C001', '14:00:40:00', '14:00:50:00')], takes, utc))).toEqual([[1, 'a1', 'time']]);
		// Past the slack it is no match by time; alone on its camera it still matches by order.
		expect(pairs(matchClips([clip(1, 'A001C001', '14:00:50:00', '14:01:00:00')], takes, utc))).toEqual([[1, 'a1', 'order']]);
	});

	it('gives a take to the clip that covers most of it, the other left over', () => {
		const takes = [take('a1', 'A', '14:00:00', 40)];
		const clips = [clip(1, 'A001C001', '13:59:50:00', '13:59:58:00'), clip(2, 'A001C002', '14:00:00:00', '14:00:40:00')];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, null, null],
			[2, 'a1', 'time']
		]);
	});

	it('matches across midnight', () => {
		const takes = [take('a1', 'A', '23:59:50', 40)];
		expect(pairs(matchClips([clip(1, 'A001C001', '23:59:48:00', '00:00:31:00')], takes, utc))).toEqual([[1, 'a1', 'time']]);
	});

	it('lets a clip with no known camera match any camera, after the clips that know theirs', () => {
		const takes = [take('a1', 'A', '14:00:00'), take('b1', 'B', '14:00:00')];
		const clips = [clip(1, 'X001C001', '14:00:00:00', '14:00:40:00', { camera: undefined }), clip(2, 'A001C001', '14:00:00:00', '14:00:40:00')];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 'b1', 'time'],
			[2, 'a1', 'time']
		]);
	});
});

describe('matchClips by order', () => {
	it('matches by camera roll, then in order against the takes on that camera, without time of day timecode', () => {
		const takes = [take('a1', 'A', '14:00:00'), take('b1', 'B', '14:00:00'), take('a2', 'A', '14:05:00'), take('b2', 'B', '14:05:00'), take('a3', 'A', '14:10:00')];
		const clips = [
			clip(1, 'B001C001', '01:00:00:00', '01:00:40:00'),
			clip(2, 'A002C004', '01:03:00:00', '01:03:40:00'),
			clip(3, 'A001C001', '01:00:00:00', '01:00:40:00'),
			clip(4, 'A001C002', '01:01:00:00', '01:01:40:00'),
			clip(5, 'B001C002', '01:01:00:00', '01:01:40:00'),
			clip(6, 'B001C003', '01:02:00:00', '01:02:40:00')
		];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 'b1', 'order'],
			[2, 'a3', 'order'],
			[3, 'a1', 'order'],
			[4, 'a2', 'order'],
			[5, 'b2', 'order'],
			[6, null, null]
		]);
	});

	it('orders clips with no timecode by name within a roll, and takes never started last', () => {
		const takes = [take('a3', 'A'), take('a1', 'A', '14:00:00'), take('a2', 'A', '14:05:00')];
		const clips = [clip(1, 'A001C003'), clip(2, 'A001C001'), clip(3, 'A001C002')];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 'a3', 'order'],
			[2, 'a1', 'order'],
			[3, 'a2', 'order']
		]);
	});

	it('fills a gap between clips matched by time with the clips and takes inside it', () => {
		// a2 was never started; its clip sits between the clips of a1 and a3.
		const takes = [take('a1', 'A', '14:00:00'), take('a2', 'A'), take('a3', 'A', '14:10:00')];
		const clips = [clip(1, 'A001C001', '14:00:00:00', '14:00:40:00'), clip(2, 'A001C002', '14:04:00:00', '14:04:40:00'), clip(3, 'A001C003', '14:10:00:00', '14:10:40:00')];
		// Never started, a2 sorts last: after a3, so the gap between a1 and a3 has no take for clip 2.
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 'a1', 'time'],
			[2, null, null],
			[3, 'a3', 'time']
		]);
		const started = [take('a1', 'A', '14:00:00'), take('a2', 'A', '14:08:00'), take('a3', 'A', '14:10:00')];
		const late = [clip(1, 'A001C001', '14:00:00:00', '14:00:40:00'), clip(2, 'A001C002', '14:04:00:00', '14:04:40:00'), clip(3, 'A001C003', '14:10:00:00', '14:10:40:00')];
		expect(pairs(matchClips(late, started, utc))).toEqual([
			[1, 'a1', 'time'],
			[2, 'a2', 'order'],
			[3, 'a3', 'time']
		]);
	});

	it('pairs everything in one group on a day with one camera, letters or not', () => {
		const takes = [take('t1', undefined, '14:00:00'), take('t2', undefined, '14:05:00')];
		const clips = [clip(1, 'A001C001', '01:00:00:00', '01:00:40:00'), clip(2, 'A001C002', '01:01:00:00', '01:01:40:00')];
		expect(pairs(matchClips(clips, takes, utc))).toEqual([
			[1, 't1', 'order'],
			[2, 't2', 'order']
		]);
	});

	it('leaves a clip with no known camera over when the day has two cameras and no time matches', () => {
		const takes = [take('a1', 'A', '14:00:00'), take('b1', 'B', '14:00:00')];
		expect(pairs(matchClips([clip(1, 'clip_1', '01:00:00:00', '01:00:40:00', { camera: undefined, roll: undefined })], takes, utc))).toEqual([[1, null, null]]);
	});

	it('matches nothing when there are no takes', () => {
		expect(pairs(matchClips([clip(1, 'A001C001')], [], utc))).toEqual([[1, null, null]]);
	});
});

describe('withPicks', () => {
	const auto = [
		{ row: 1, takeId: 'a1', how: 'time' as const },
		{ row: 2, takeId: 'a2', how: 'time' as const },
		{ row: 3 }
	];

	it('puts a clip on the take picked, and the clip that had it is left over', () => {
		expect(pairs(withPicks(auto, [{ row: 3, takeId: 'a2' }]))).toEqual([
			[1, 'a1', 'time'],
			[2, null, null],
			[3, 'a2', 'picked']
		]);
	});

	it('leaves a clip over when the pick is no take', () => {
		expect(pairs(withPicks(auto, [{ row: 1, takeId: null }]))).toEqual([
			[1, null, 'picked'],
			[2, 'a2', 'time'],
			[3, null, null]
		]);
	});

	it('applies picks in order: the later wins', () => {
		expect(pairs(withPicks(auto, [{ row: 3, takeId: 'a1' }, { row: 2, takeId: 'a1' }]))).toEqual([
			[1, null, null],
			[2, 'a1', 'picked'],
			[3, null, null]
		]);
	});

	it('ignores a pick for a clip that is not there', () => {
		expect(withPicks(auto, [{ row: 9, takeId: 'a1' }])).toEqual(auto);
	});
});

describe('matchCounts', () => {
	it('counts the matches by how they were made, and the clips left over', () => {
		expect(matchCounts([{ row: 1, takeId: 'a', how: 'time' }, { row: 2, takeId: 'b', how: 'order' }, { row: 3, takeId: 'c', how: 'picked' }, { row: 4, how: 'picked' }, { row: 5 }])).toEqual({ time: 1, order: 1, picked: 1, left: 2 });
	});
});
