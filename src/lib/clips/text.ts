// The words the clip import shows: a take, how a clip found it, what it fills, updates and keeps,
// what could not be read. Pure: strings from the catalogue (`t`).

import { valueText, type Names } from '$lib/components/slates/values';
import { lensTitle } from '$lib/gear/names';
import { t, tk } from '$lib/i18n/messages';
import { fieldLabel } from '$lib/i18n/modelText';
import { findField } from '$lib/model/catalogue';
import { formatRational } from '$lib/model/rational';
import type { Lens } from '$lib/model/types';
import { fieldRef } from '$lib/slates/fields';
import type { Clip, ClipIssue } from './clips';
import type { ColumnTarget } from './columns';
import type { How } from './match';
import type { FieldPlan, TakePlan } from './plan';
import type { DayLine } from './preview';

const label = (scope: 'take' | 'cameraSetup', key: string) => fieldLabel(findField(scope, key)!.def);
/** A value as the take sheet shows it: with its unit, a lens by its name. */
const show = (key: string, value: unknown, names?: Names) => valueText(fieldRef('take', key)!, value, 'metric', names);
/** "A", "A and B", "A, B and C". */
const andList = (items: string[]) => (items.length < 2 ? items.join('') : t('clips.and', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] }));
const lensName = (lens: Lens) => (lens.lensSerialNumber ? t('clips.lens.serial', { lens: lensTitle(lens), serial: lens.lensSerialNumber }) : lensTitle(lens));

/** "Slate 42A, take 3 · A". */
export function takeText(line: DayLine): string {
	const params = { slate: line.slate.slateUID ?? '', take: line.take.take ?? '', camera: line.camera };
	return line.camera ? t('clips.row.takeCam', params) : t('clips.row.take', params);
}

/** "Slate 42A, take 3 · A · By time of day". */
export function matchLine(line: DayLine, how: How): string {
	return `${takeText(line)} · ${tk(`clips.how.${how}`)}`;
}

/**
 * One line for the fields filled and one for the lens filled, then one per update, per value kept
 * and for a lens the gear does not match. `names`: the lenses by id. `lens`: what the file names.
 */
export function fieldLines(fields: readonly FieldPlan[], options: { names?: Names; lens?: TakePlan['lens'] } = {}): string[] {
	const { names, lens } = options;
	const adds = fields.filter((f) => f.kind === 'add' && f.key !== 'lensId').map((f) => label('take', f.key));
	const lensAdd = fields.find((f) => f.kind === 'add' && f.key === 'lensId');
	const lines = [
		...(adds.length ? [t('clips.row.fills', { fields: adds.join(', ') })] : []),
		...(lensAdd ? [t('clips.row.lens', { lens: show('lensId', lensAdd.to, names) })] : []),
		...fields.filter((f) => f.kind === 'update').map((f) => t('clips.row.update', { field: label('take', f.key), from: show(f.key, f.from, names), to: show(f.key, f.to, names) })),
		...fields
			.filter((f) => f.kind === 'kept')
			.map((f) =>
				f.from === undefined
					? t('clips.row.cleared', { field: label('take', f.key), to: show(f.key, f.to, names) })
					: t('clips.row.kept', { field: label('take', f.key), from: show(f.key, f.from, names), to: show(f.key, f.to, names) })
			)
	];
	if (!lines.length) lines.push(t('clips.row.nothing'));
	if (lens?.match.kind === 'none') lines.push(t('clips.row.lens.none', { name: lens.name }));
	if (lens?.match.kind === 'many') lines.push(t('clips.row.lens.many', { name: lens.name, lenses: andList(lens.match.lenses.map(lensName)) }));
	return lines;
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
	if (issue.kind === 'badValue') return t('clips.issue.badValue', { row: issue.row, column: issue.column, value: issue.value });
	return t('clips.issue.badTimecode', { row: issue.row, column: issue.column, value: issue.value });
}

/** What a column is read as: the field's own label where it fills one. */
export function columnLabel(target: ColumnTarget): string {
	if (target === 'camera') return label('cameraSetup', 'cameraLabel');
	if (target === 'duration' || target === 'fps') return t(`clips.column.${target}`);
	if (target === 'lens') return label('take', 'lensId');
	return label('take', target);
}

/** The button that applies the import. */
export function commitText(takes: number): string {
	return takes === 0 ? t('clips.commit.none') : tk(`clips.commit.${takes === 1 ? 'one' : 'other'}`, { n: takes });
}
