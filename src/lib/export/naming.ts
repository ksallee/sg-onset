// File and folder names for exports: deterministic and safe on macOS, Windows, Linux and in a zip.
// `<project>_<shootday>_<kind>.<ext>`; photos as CRIF names them, SLATE-CAMERALETTER-reference-N;
// the folders of a wrap package: a slate's, a reference kind's, a reference's. Pure.

import type { Project, ShootDay } from '$lib/model/types';
import { isBuiltInKind, kindChoices, KINDS, type BuiltInKind } from '$lib/references/kinds';
import { compareShootDays } from './selection';

const MAX = 60;
/** Letters NFKD does not split into a base and an accent. */
const LETTERS: Record<string, string> = { ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ß: 'ss', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH' };
/** Names Windows reserves, alone or before an extension: `nul.tar` is as bad as `nul`. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

function safe(text: string, fallback: string, unsafe: RegExp): string {
	const plain = text
		.replace(/[øØæÆœŒßđĐłŁþÞ]/g, (c) => LETTERS[c])
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '');
	const trim = (s: string) => s.replace(/^[-.]+|[-.]+$/g, '');
	let s = trim(plain.replace(unsafe, '-').replace(/-{2,}/g, '-'));
	s = trim(s.slice(0, MAX));
	if (s === '') return fallback;
	const dot = s.indexOf('.');
	const base = dot < 0 ? s : s.slice(0, dot);
	return RESERVED.test(base) ? `${base}-x${s.slice(base.length)}` : s;
}

/**
 * A safe name part. Accents dropped, case kept; anything but ASCII letters, digits, dot and hyphen
 * becomes one hyphen (underscore too: it separates the parts of a name); no hyphen or dot at either
 * end, so no hidden file and no trailing dot; at most 60 characters; a name Windows reserves gets
 * "-x", before an extension too. Nothing left gives `fallback`.
 */
export function slug(text: string, fallback = 'untitled'): string {
	return safe(text, fallback, /[^A-Za-z0-9.-]+/g);
}

/** A safe folder name for a name typed as it is on a device: a slug that keeps underscores. `HDRI_0412`. */
export function folderName(text: string, fallback = 'untitled'): string {
	return safe(text, fallback, /[^A-Za-z0-9._-]+/g);
}

/** A slate's folder in a wrap package: the slate as its photo names start, `42A`. */
export function slateFolderName(slateUID: string | undefined): string {
	return slug((slateUID ?? '').replace(/\s+/g, ''), 'slate');
}

/** The folders of the built-in kinds: their English labels, fixed, so a folder never changes with the app's language. */
const KIND_FOLDERS: Record<BuiltInKind, string> = {
	hdri360: 'hdri-360',
	video360: '360-video',
	hdrReference: 'hdr-reference',
	witnessCamera: 'witness-camera',
	lidarScan: 'lidar-scan',
	texturedModel: 'textured-model',
	photogrammetry: 'photogrammetry',
	splat: 'splat',
	other: 'other'
};

/** The folder of a reference kind: a built-in one's fixed name, a project kind made safe, in lower case. No kind is Other. */
export function kindFolderName(kind: string): string {
	const k = kind.trim();
	if (isBuiltInKind(k)) return KIND_FOLDERS[k];
	return slug(k, 'other').toLowerCase();
}

/**
 * The folder of each kind, so one kind has one folder name in every slate. The built-in kinds keep
 * theirs; then the project's kinds in the order added, then kinds it no longer lists in
 * alphabetical order, each stepped (`-2`) when its name is taken. No kind is Other.
 */
export function kindFolders(kinds: Iterable<string>, projectKinds: readonly string[]): Map<string, string> {
	const present = new Set([...kinds].map((k) => k.trim()));
	const listed = kindChoices(projectKinds).filter((k) => !isBuiltInKind(k));
	const unlisted = [...present].filter((k) => k !== '' && !isBuiltInKind(k) && !listed.includes(k)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	const taken = new Set<string>();
	const out = new Map<string, string>();
	for (const k of KINDS) out.set(k, uniqueName(KIND_FOLDERS[k], taken));
	for (const k of [...listed, ...unlisted]) out.set(k, uniqueName(kindFolderName(k), taken));
	const named = new Map<string, string>();
	for (const k of kinds) named.set(k, out.get(k.trim()) ?? KIND_FOLDERS.other);
	return named;
}

/**
 * `base` with `ext`, stepped `-2`, `-3` until no name in `taken` matches it, case ignored as
 * macOS and Windows ignore it. Notes the name in `taken`.
 */
export function uniqueName(base: string, taken: Set<string>, ext = ''): string {
	let name = `${base}${ext}`;
	for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}${ext}`;
	taken.add(name.toLowerCase());
	return name;
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
