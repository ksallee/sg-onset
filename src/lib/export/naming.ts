// File names for exports: deterministic and safe on macOS, Windows, Linux and in a zip.
// `<project>_<shootday>_<kind>.<ext>`; photos as CRIF names them, SLATE-CAMERALETTER-reference-N.
// Pure.

import type { Project, ShootDay } from '$lib/model/types';
import { compareShootDays } from './selection';

const MAX = 60;
/** Letters NFKD does not split into a base and an accent. */
const LETTERS: Record<string, string> = { ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ß: 'ss', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH' };
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A safe name part. Accents dropped, case kept; anything but ASCII letters, digits, dot and hyphen
 * becomes one hyphen (underscore too: it separates the parts of a name); no hyphen or dot at either
 * end; at most 60 characters; a name Windows reserves gets "-x". Nothing left gives `fallback`.
 */
export function slug(text: string, fallback = 'untitled'): string {
	const plain = text
		.replace(/[øØæÆœŒßđĐłŁþÞ]/g, (c) => LETTERS[c])
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '');
	const trim = (s: string) => s.replace(/^[-.]+|[-.]+$/g, '');
	let s = trim(plain.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/-{2,}/g, '-'));
	s = trim(s.slice(0, MAX));
	if (s === '') return fallback;
	return RESERVED.test(s) ? `${s}-x` : s;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** One day: "2026-11-10-day03". Several: "2026-11-10-to-2026-11-11". None: "all-days". */
export function dayPart(days: readonly ShootDay[]): string {
	if (days.length === 0) return 'all-days';
	const sorted = [...days].sort(compareShootDays);
	if (sorted.length === 1) {
		const d = sorted[0];
		const parts = [d.shootDate, d.shootDay === undefined ? undefined : `day${pad2(d.shootDay)}`].filter((p): p is string => !!p);
		return slug(parts.join('-'), 'shoot-day');
	}
	const first = sorted[0].shootDate ?? '';
	const last = sorted[sorted.length - 1].shootDate ?? '';
	return slug(first === last ? first : `${first}-to-${last}`, 'shoot-days');
}

export const EXPORT_KINDS = {
	'camera-report': 'csv',
	'all-fields': 'csv',
	editorial: 'ale',
	data: 'json',
	manifest: 'json'
} as const;
export type ExportKind = keyof typeof EXPORT_KINDS;

/** The base of every name in a package: "<project>_<shootday>". */
export function packageName(project: Project, days: readonly ShootDay[]): string {
	return `${slug(project.name ?? '', 'project')}_${dayPart(days)}`;
}

/** "<project>_<shootday>_<kind>.<ext>". */
export function exportFileName(project: Project, days: readonly ShootDay[], kind: ExportKind): string {
	return `${packageName(project, days)}_${kind}.${EXPORT_KINDS[kind]}`;
}

/** CRIF: the slate and camera letter with whitespace removed, then "-reference-N". */
export function photoFileName(slate: string, cameraLetter: string, n: number, ext: string): string {
	const parts = [slug(slate.replace(/\s+/g, ''), 'slate'), cameraLetter.replace(/\s+/g, '') === '' ? '' : slug(cameraLetter.replace(/\s+/g, ''), '')];
	return `${parts.filter((p) => p !== '').join('-')}-reference-${n}.${ext}`;
}

const MIME_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/tiff': 'tif',
	'image/x-adobe-dng': 'dng',
	'video/quicktime': 'mov',
	'video/mp4': 'mp4'
};

/** The extension for a file: from its type, else from its name, else "bin". */
export function extensionFor(type: string, name?: string): string {
	const known = MIME_EXT[type.toLowerCase()];
	if (known) return known;
	const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? '')?.[1];
	return fromName ? fromName.toLowerCase() : 'bin';
}
