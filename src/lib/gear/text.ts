// The lines the gear lists show under a name. Pure: strings from the catalogue (`t`).

import { tk, t } from '$lib/i18n/messages';
import { formatRational } from '$lib/model/rational';
import type { Camera, Dimensions, Lens } from '$lib/model/types';
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

