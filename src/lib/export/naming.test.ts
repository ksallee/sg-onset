import { describe, expect, it } from 'vitest';
import { dayPart, exportFileName, extensionFor, photoFileName, slug } from './naming';
import { day3, day4, project } from './testData';

describe('slug', () => {
	it('keeps letters, digits, dot and hyphen, case kept', () => {
		expect(slug('Night Train')).toBe('Night-Train');
		expect(slug('42A')).toBe('42A');
		expect(slug('v1.2')).toBe('v1.2');
	});

	it('turns accents into plain letters', () => {
		expect(slug('Señor Café Ørsted')).toBe('Senor-Cafe-Orsted');
		expect(slug('Ébène')).toBe('Ebene');
	});

	it('turns every other run of characters into one hyphen, underscores too', () => {
		expect(slug('a / b \\ c: d*?"<>|e')).toBe('a-b-c-d-e');
		expect(slug('a__b')).toBe('a-b');
		expect(slug('tab\there\nnl')).toBe('tab-here-nl');
	});

	it('trims hyphens and dots at the ends, so no hidden file and no trailing dot', () => {
		expect(slug('  .hidden. ')).toBe('hidden');
		expect(slug('--x--')).toBe('x');
	});

	it('cuts at 60 characters, never ending on a hyphen', () => {
		const long = 'a'.repeat(59) + ' bcd';
		expect(slug(long)).toBe('a'.repeat(59));
		expect(slug('b'.repeat(80))).toHaveLength(60);
	});

	it('gives the fallback when nothing is left', () => {
		expect(slug('')).toBe('untitled');
		expect(slug('日本語')).toBe('untitled');
		expect(slug('***', 'project')).toBe('project');
	});

	it('steps around names Windows reserves', () => {
		expect(slug('CON')).toBe('CON-x');
		expect(slug('nul')).toBe('nul-x');
		expect(slug('com1')).toBe('com1-x');
		expect(slug('Console')).toBe('Console');
	});
});

describe('dayPart', () => {
	it('names one day by date and number', () => {
		expect(dayPart([day3])).toBe('2026-11-10-day03');
		expect(dayPart([{ ...day3, shootDay: 112 }])).toBe('2026-11-10-day112');
		expect(dayPart([{ ...day3, shootDay: undefined }])).toBe('2026-11-10');
		expect(dayPart([{ ...day3, shootDate: undefined }])).toBe('day03');
		expect(dayPart([{ id: 'x', projectId: 'p1' }])).toBe('shoot-day');
	});

	it('names several days by their first and last date', () => {
		expect(dayPart([day4, day3])).toBe('2026-11-10-to-2026-11-11');
	});

	it('says all when no day is picked', () => {
		expect(dayPart([])).toBe('all-days');
	});
});

describe('exportFileName', () => {
	it('is <project>_<shootday>_<kind>.<ext>', () => {
		expect(exportFileName(project, [day3], 'camera-report')).toBe('Night-Train_2026-11-10-day03_camera-report.csv');
		expect(exportFileName(project, [day3], 'all-fields')).toBe('Night-Train_2026-11-10-day03_all-fields.csv');
		expect(exportFileName(project, [day3], 'editorial')).toBe('Night-Train_2026-11-10-day03_editorial.ale');
		expect(exportFileName(project, [day3], 'data')).toBe('Night-Train_2026-11-10-day03_data.json');
		expect(exportFileName(project, [day3], 'manifest')).toBe('Night-Train_2026-11-10-day03_manifest.json');
	});

	it('falls back to project when the project has no usable name', () => {
		expect(exportFileName({ id: 'p', name: '???' }, [], 'data')).toBe('project_all-days_data.json');
	});
});

describe('photoFileName', () => {
	it('follows CRIF: SLATE-CAMERALETTER-reference-N, whitespace removed', () => {
		expect(photoFileName('22ac', 'A', 1, 'jpg')).toBe('22ac-A-reference-1.jpg');
		expect(photoFileName('22 ac', ' A ', 2, 'jpg')).toBe('22ac-A-reference-2.jpg');
	});

	it('leaves the letter out when the take has no camera', () => {
		expect(photoFileName('9', '', 1, 'heic')).toBe('9-reference-1.heic');
	});

	it('makes an unsafe slate safe', () => {
		expect(photoFileName('42/A', 'B', 1, 'jpg')).toBe('42-A-B-reference-1.jpg');
	});
});

describe('extensionFor', () => {
	it('reads the type, then the file name', () => {
		expect(extensionFor('image/jpeg')).toBe('jpg');
		expect(extensionFor('image/heic')).toBe('heic');
		expect(extensionFor('video/quicktime')).toBe('mov');
		expect(extensionFor('application/octet-stream', 'IMG_0001.DNG')).toBe('dng');
		expect(extensionFor('')).toBe('bin');
	});
});
