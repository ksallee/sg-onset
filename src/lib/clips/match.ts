// Which take each clip of the DIT's file belongs to (Kevin, #109). First by time of day: a clip
// whose timecode falls in a take's Start to End, on the same camera, belongs to it; a take goes to
// the clip that covers most of it. Then by camera roll and order: per camera, the clips left over
// (by roll, then timecode or name) pair in order with the takes left over (in the order shot),
// between the clips matched by time. Without time of day timecode that is the whole match. The
// person then fixes any match by hand (`withPicks`). Pure: the time zone is passed in.

import { timecodeBase } from '$lib/export/timecode';
import type { Clip } from './clips';
import { clockSeconds, localSeconds } from './timecode';

/** A take as the match sees it. */
export type MatchTake = {
	id: string;
	/** The letter of its camera setup. */
	camera?: string;
	startedAt?: string;
	endedAt?: string;
};

/** How a match was made: by time of day, by roll and order, or picked by the person. */
export type How = 'time' | 'order' | 'picked';

/** One clip and its take. No take: left over. */
export type Match = { row: number; takeId?: string; how?: How };

/** The person's fix: this clip on this take, or on none (null). */
export type Pick = { row: number; takeId: string | null };

export type MatchOptions = {
	/** Minutes east of UTC at a timestamp: the device's time zone. */
	offsetMinutes: (timestamp: string) => number;
	/** Seconds a take's Start and End are widened by, for a camera that rolls early or runs on. */
	slack?: number;
};

const SLACK = 15;
const DAY = 86400;
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const letter = (s: string | undefined) => s?.trim().toUpperCase() || undefined;

/** A span in seconds of the day. */
type Span = { from: number; to: number };

function clipSpan(clip: Clip): Span | undefined {
	if (!clip.start) return undefined;
	const base = timecodeBase(clip.rate);
	const from = clockSeconds(clip.start, base)!;
	let to = clip.end ? clockSeconds(clip.end, base)! + 1 / base : from + 1 / base;
	if (to < from) to += DAY;
	return { from, to };
}

function takeSpan(take: MatchTake, offsetMinutes: (timestamp: string) => number): Span | undefined {
	if (!take.startedAt) return undefined;
	const from = localSeconds(take.startedAt, offsetMinutes(take.startedAt));
	if (from === undefined) return undefined;
	const ran = (Date.parse(take.endedAt ?? '') - Date.parse(take.startedAt)) / 1000;
	return { from, to: from + (Number.isFinite(ran) && ran > 0 ? ran : 0) };
}

/** How long `clip` overlaps `take` widened by the slack, the clip moved by a day if that is nearer. */
function overlap(clip: Span, take: Span, slack: number): { seconds: number; gap: number } {
	let shift = 0;
	if (clip.from - take.from > DAY / 2) shift = -DAY;
	else if (take.from - clip.from > DAY / 2) shift = DAY;
	const from = clip.from + shift;
	const to = clip.to + shift;
	return { seconds: Math.min(to, take.to + slack) - Math.max(from, take.from - slack), gap: Math.abs(from - take.from) };
}

/**
 * The take of each clip, in the clips' order. `takes` in the day's order (slate, take, camera):
 * the order shot is by Start, takes never started last, in the day's order.
 */
export function matchClips(clips: readonly Clip[], takes: readonly MatchTake[], options: MatchOptions): Match[] {
	const slack = options.slack ?? SLACK;
	const cameras = new Set(takes.map((t) => letter(t.camera)).filter((c): c is string => !!c));
	/** A clip's camera, when a take is on it: a letter no take has tells nothing. */
	const cameraOf = (clip: Clip) => {
		const c = letter(clip.camera);
		return c && cameras.has(c) ? c : undefined;
	};
	const result = new Map<number, Match>(clips.map((c) => [c.row, { row: c.row }]));
	const used = new Set<string>();

	// By time of day: every pair that overlaps, the clips that know their camera first, then the
	// longest overlap, then the nearest start. Each clip and each take once.
	const spans = new Map(takes.map((t) => [t.id, takeSpan(t, options.offsetMinutes)]));
	const candidates: { row: number; takeId: string; tier: number; seconds: number; gap: number }[] = [];
	for (const clip of clips) {
		const span = clipSpan(clip);
		if (!span) continue;
		const camera = cameraOf(clip);
		for (const take of takes) {
			const tspan = spans.get(take.id);
			const tcam = letter(take.camera);
			if (!tspan || (camera && tcam && camera !== tcam)) continue;
			const o = overlap(span, tspan, slack);
			if (o.seconds > 0) candidates.push({ row: clip.row, takeId: take.id, tier: camera && tcam ? 0 : 1, seconds: o.seconds, gap: o.gap });
		}
	}
	candidates.sort((a, b) => a.tier - b.tier || b.seconds - a.seconds || a.gap - b.gap || a.row - b.row);
	for (const c of candidates) {
		const m = result.get(c.row)!;
		if (m.takeId || used.has(c.takeId)) continue;
		m.takeId = c.takeId;
		m.how = 'time';
		used.add(c.takeId);
	}

	// By roll and order, per camera. On a day with one camera or none, one group.
	const single = cameras.size <= 1;
	const groupOf = (camera: string | undefined) => (single ? '' : (camera ?? ''));
	const shot = takes
		.map((take, i) => ({ take, i, at: Date.parse(take.startedAt ?? '') }))
		.sort((a, b) => (Number.isNaN(a.at) ? 1 : 0) - (Number.isNaN(b.at) ? 1 : 0) || (Number.isNaN(a.at) ? 0 : a.at - b.at) || a.i - b.i)
		.map((s) => s.take);
	for (const group of new Set([...clips.map((c) => groupOf(cameraOf(c))), ...takes.map((t) => groupOf(letter(t.camera)))])) {
		const mine = clips.filter((c) => groupOf(cameraOf(c)) === group);
		const timed = mine.every((c) => c.startFrame !== undefined);
		const seq = [...mine].sort(
			(a, b) => collator.compare(a.roll ?? '', b.roll ?? '') || (timed ? a.startFrame! - b.startFrame! : collator.compare(a.name, b.name)) || a.row - b.row
		);
		const order = shot.filter((t) => groupOf(letter(t.camera)) === group);
		const takeAt = new Map(order.map((t, i) => [t.id, i]));

		// The clips matched by time, in order on both sides, cut the lists into gaps.
		const anchors: { clip: number; take: number }[] = [{ clip: -1, take: -1 }];
		seq.forEach((c, i) => {
			const m = result.get(c.row)!;
			const at = m.takeId === undefined ? undefined : takeAt.get(m.takeId);
			if (at !== undefined && at > anchors[anchors.length - 1].take) anchors.push({ clip: i, take: at });
		});
		anchors.push({ clip: seq.length, take: order.length });
		for (let k = 1; k < anchors.length; k++) {
			const [a, b] = [anchors[k - 1], anchors[k]];
			const free = seq.slice(a.clip + 1, b.clip).filter((c) => !result.get(c.row)!.takeId);
			const open = order.slice(a.take + 1, b.take).filter((t) => !used.has(t.id));
			free.forEach((c, i) => {
				const t = open[i];
				if (!t) return;
				const m = result.get(c.row)!;
				m.takeId = t.id;
				m.how = 'order';
				used.add(t.id);
			});
		}
	}
	return clips.map((c) => result.get(c.row)!);
}

/** The matches with the person's picks, in the order made: a clip on the take picked, the clip that had it left over. */
export function withPicks(matches: readonly Match[], picks: readonly Pick[]): Match[] {
	const out = matches.map((m) => ({ ...m }));
	for (const pick of picks) {
		const mine = out.find((m) => m.row === pick.row);
		if (!mine) continue;
		if (pick.takeId) {
			for (const m of out) {
				if (m !== mine && m.takeId === pick.takeId) {
					delete m.takeId;
					delete m.how;
				}
			}
			mine.takeId = pick.takeId;
		} else {
			delete mine.takeId;
		}
		mine.how = 'picked';
	}
	return out;
}

/** How many clips matched each way, and how many are left over. */
export function matchCounts(matches: readonly Match[]): { time: number; order: number; picked: number; left: number } {
	const counts = { time: 0, order: 0, picked: 0, left: 0 };
	for (const m of matches) {
		if (!m.takeId) counts.left++;
		else counts[m.how ?? 'picked']++;
	}
	return counts;
}
