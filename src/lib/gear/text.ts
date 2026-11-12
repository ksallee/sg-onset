// The lines the gear lists show under a name. Pure: strings from the catalogue (`t`).

import { hasMessage, tk, t } from '$lib/i18n/messages';
import { importIssueText } from '$lib/i18n/modelText';
import type { ImportIssue } from '$lib/model/gearImport';
import { formatRational } from '$lib/model/rational';
import type { Camera, Dimensions, Lens } from '$lib/model/types';
import type { LensSeries, LibraryCamera, LibraryLens } from './library';
import { focalRange, lensKind } from './names';

/** "1 lens", "3 lenses". */
export function countText(scope: 'camera' | 'lens' | 'cameraSetup', n: number): string {
	return tk(`gear.count.${scope}.${n === 1 ? 'one' : 'other'}`, { n });
}

/** "32 mm", "24–290 mm"; empty with no focal length. */
export function focalText(lens: Lens): string {
	const range = focalRange(lens);
	if (!range) return '';
	return range.max === undefined ? t('gear.focal.prime', { min: range.min }) : t('gear.focal.zoom', { min: range.min, max: range.max });
}

/** The focal length on a lens's badge, no unit: "32", "24–290", "–". */
export function focalBadge(lens: Lens): string {
	const r = focalRange(lens);
	return r ? (r.max === undefined ? String(r.min) : `${r.min}–${r.max}`) : '–';
}

export function lensLine(lens: Lens): string {
	const kind = lensKind(lens);
	return [
		t(`gear.kind.${kind}`),
		focalText(lens),
		lens.anamorphicSqueeze ? t('gear.squeeze', { squeeze: formatRational(lens.anamorphicSqueeze) }) : '',
		lens.lensSerialNumber ? t('gear.serial', { serial: lens.lensSerialNumber }) : ''
	]
		.filter(Boolean)
		.join(' · ');
}

/**
 * What one import issue says in the list of rows, where the row number already sits beside it:
 * the `<key>.inRow` string, or the full message for a key with none.
 */
export function rowIssueText(issue: Pick<ImportIssue, 'key' | 'row' | 'column' | 'value'>): string {
	const key = `${issue.key}.inRow`;
	return hasMessage(key) ? tk(key, { column: issue.column ?? '', value: issue.value ?? '' }) : importIssueText(issue);
}

const size = (d: Dimensions | undefined, unit: string) => (d ? t('gear.size', { width: d.width, height: d.height, unit }) : '');

export function cameraLine(camera: Camera): string {
	return [
		size(camera.activeSensorPhysicalDimensions, tk('unit.mm')),
		size(camera.activeSensorResolution, tk('unit.px')),
		camera.cameraSerialNumber ? t('gear.serial', { serial: camera.cameraSerialNumber }) : ''
	]
		.filter(Boolean)
		.join(' · ');
}


/** A library body: "27.99 × 19.22 mm · 4608 × 3164 px · 4.6K 3:2 Open Gate". */
export function libraryCameraLine(camera: LibraryCamera): string {
	return [size(camera.sensor, tk('unit.mm')), size(camera.resolution, tk('unit.px')), camera.mode ?? ''].filter(Boolean).join(' · ');
}

const stop = (n: number | undefined) => (n === undefined ? '' : t('gear.library.tStop', { stop: n }));

/** A library lens: "T1.8 · 2× anamorphic · FF". */
export function libraryLensLine(lens: LibraryLens): string {
	return [stop(lens.tStop), lens.squeeze ? t('gear.squeeze', { squeeze: formatRational(lens.squeeze) }) : '', lens.coverage ?? ''].filter(Boolean).join(' · ');
}

/** A lens set: "12 primes · 2 zooms · 15–200 mm". The span is of the primes, or of the zooms when it has no prime. */
export function seriesLine(series: LensSeries): string {
	const primes = series.lenses.filter((l) => l.focalLengthMax === undefined);
	const zooms = series.lenses.filter((l) => l.focalLengthMax !== undefined);
	const of = primes.length ? primes : zooms;
	const min = Math.min(...of.map((l) => l.focalLength));
	const max = Math.max(...of.map((l) => l.focalLengthMax ?? l.focalLength));
	return [
		primes.length ? tk(`gear.library.primes.${primes.length === 1 ? 'one' : 'other'}`, { n: primes.length }) : '',
		zooms.length ? tk(`gear.library.zooms.${zooms.length === 1 ? 'one' : 'other'}`, { n: zooms.length }) : '',
		min === max ? t('gear.focal.prime', { min }) : t('gear.focal.zoom', { min, max })
	]
		.filter(Boolean)
		.join(' · ');
}
