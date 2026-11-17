// The words the clip import shows: a take, how a clip found it, what it fills, updates and keeps,
// what could not be read. Pure: strings from the catalogue (`t`).

import { t, tk } from '$lib/i18n/messages';
import { fieldLabel } from '$lib/i18n/modelText';
import { findField } from '$lib/model/catalogue';
import { formatRational } from '$lib/model/rational';
import type { Clip, ClipIssue } from './clips';
import type { ColumnTarget } from './columns';
import type { How } from './match';
import type { FieldPlan } from './plan';
import type { DayLine } from './preview';

const label = (scope: 'take' | 'cameraSetup', key: string) => fieldLabel(findField(scope, key)!.def);
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** "Slate 42A, take 3 · A". */
export function takeText(line: DayLine): string {
	const params = { slate: line.slate.slateUID ?? '', take: line.take.take ?? '', camera: line.camera };
	return line.camera ? t('clips.row.takeCam', params) : t('clips.row.take', params);
}

/** "Slate 42A, take 3 · A · By time of day". */
export function matchLine(line: DayLine, how: How): string {
	return `${takeText(line)} · ${tk(`clips.how.${how}`)}`;
}

/** One line for the fields filled, then one per update and per typed value kept. */
export function fieldLines(fields: readonly FieldPlan[]): string[] {
	if (!fields.length) return [t('clips.row.nothing')];
	const adds = fields.filter((f) => f.kind === 'add').map((f) => label('take', f.key));
	return [
		...(adds.length ? [t('clips.row.fills', { fields: adds.join(', ') })] : []),
		...fields.filter((f) => f.kind === 'update').map((f) => t('clips.row.update', { field: label('take', f.key), from: show(f.from), to: f.to })),
		...fields.filter((f) => f.kind === 'kept').map((f) => t('clips.row.kept', { field: label('take', f.key), from: show(f.from), to: f.to }))
	];
}

/** "A001 · 14:02:11:04 to 14:02:59:09", for a clip with no take. */
export function clipLine(clip: Clip): string {
	const time = clip.start ? t('clips.row.timecode', { start: clip.start, end: clip.end ?? '' }) : t('clips.row.noTimecode');
	return [clip.roll, time].filter(Boolean).join(' · ');
}

export function issueText(issue: ClipIssue): string {
	if (issue.kind === 'noRate') return t('clips.issue.noRate', { rate: formatRational(issue.rate) });
	if (issue.kind === 'noNameColumn') return t('clips.issue.noNameColumn');
	if (issue.kind === 'noName') return t('clips.issue.noName', { row: issue.row });
	return t('clips.issue.badTimecode', { row: issue.row, column: issue.column, value: issue.value });
}

/** What a column is read as: the field's own label where it fills one. */
export function columnLabel(target: ColumnTarget): string {
	if (target === 'camera') return label('cameraSetup', 'cameraLabel');
	if (target === 'duration' || target === 'fps') return t(`clips.column.${target}`);
	return label('take', target);
}

/** The button that applies the import. */
export function commitText(takes: number): string {
	return takes === 0 ? t('clips.commit.none') : tk(`clips.commit.${takes === 1 ? 'one' : 'other'}`, { n: takes });
}
