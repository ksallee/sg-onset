import { describe, expect, it } from 'vitest';
import { KINDS } from '$lib/references/kinds';
import { dayPart, exportFileName, extensionFor, folderName, kindFolderName, kindFolders, manifestFileName, photoFileName, slateFolderName, slug, uniqueName } from './naming';
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

	it('steps around names Windows reserves, with an extension too', () => {
		expect(slug('CON')).toBe('CON-x');
		expect(slug('nul')).toBe('nul-x');
		expect(slug('com1')).toBe('com1-x');
		expect(slug('LPT0')).toBe('LPT0-x');
		expect(slug('Console')).toBe('Console');
		expect(slug('nul.tar')).toBe('nul-x.tar');
		expect(slug('aux.a.b')).toBe('aux-x.a.b');
	});
});

describe('folderName', () => {
	it('is a slug that keeps underscores, so a name logged from a device stays as typed', () => {
		expect(folderName('HDRI_0412')).toBe('HDRI_0412');
		expect(folderName('PG_car_01')).toBe('PG_car_01');
		expect(folderName('Scan 01')).toBe('Scan-01');
		expect(folderName('IMG_1234.DNG')).toBe('IMG_1234.DNG');
	});

	it('is safe on every system', () => {
		expect(folderName(' Café: take 1/2 ')).toBe('Cafe-take-1-2');
		expect(folderName('_x_. ')).toBe('_x_');
		expect(folderName('.hidden')).toBe('hidden');
		expect(folderName('PRN')).toBe('PRN-x');
		expect(folderName('')).toBe('untitled');
		expect(folderName('???', 'reference')).toBe('reference');
	});
});

describe('slateFolderName', () => {
	it('is the slate as the photo names start, whitespace removed', () => {
		expect(slateFolderName('42A')).toBe('42A');
		expect(slateFolderName('22 ac')).toBe('22ac');
		expect(slateFolderName('42/A')).toBe('42-A');
		expect(slateFolderName('')).toBe('slate');
		expect(slateFolderName(undefined)).toBe('slate');
	});
});

describe('manifestFileName', () => {
	it('is the slate folder with _manifest.csv', () => {
		expect(manifestFileName('42A')).toBe('42A_manifest.csv');
		expect(manifestFileName('12A-2')).toBe('12A-2_manifest.csv');
	});
});

describe('kindFolderName', () => {
	it('names the built-in kinds in English, lower case, whatever language the app shows', () => {
		expect(KINDS.map(kindFolderName)).toEqual(['hdri-360', '360-video', 'hdr-reference', 'witness-camera', 'lidar-scan', 'textured-model', 'photogrammetry', 'splat', 'other']);
	});

	it('makes a project kind safe, in lower case', () => {
		expect(kindFolderName('Drone survey')).toBe('drone-survey');
		expect(kindFolderName('Grey ball / chrome')).toBe('grey-ball-chrome');
		expect(kindFolderName('Ñandú')).toBe('nandu');
		expect(kindFolderName('CON')).toBe('con-x');
	});

	it('puts a reference with no kind, or none left once safe, under other', () => {
		expect(kindFolderName('')).toBe('other');
		expect(kindFolderName('  ')).toBe('other');
		expect(kindFolderName('写真')).toBe('other');
	});
});

describe('kindFolders', () => {
	it('gives each kind its folder; the built-in ones keep theirs', () => {
		const folders = kindFolders(['hdri360', 'Drone survey', 'HDRI-360', ''], ['Drone survey', 'HDRI-360']);
		expect(folders.get('hdri360')).toBe('hdri-360');
		expect(folders.get('Drone survey')).toBe('drone-survey');
		expect(folders.get('HDRI-360')).toBe('hdri-360-2');
		expect(folders.get('')).toBe('other');
	});

	it('is the same whatever kinds a slate holds, so a kind has one folder name in every slate', () => {
		const alone = kindFolders(['HDRI-360'], ['HDRI-360']);
		expect(alone.get('HDRI-360')).toBe('hdri-360-2');
	});

	it('steps two project kinds that come out the same: the one added first keeps the name', () => {
		const folders = kindFolders(['drone-survey', 'Drone survey'], ['Drone survey', 'drone-survey']);
		expect(folders.get('Drone survey')).toBe('drone-survey');
		expect(folders.get('drone-survey')).toBe('drone-survey-2');
	});

	it('names a kind the project no longer lists after those it does, in alphabetical order', () => {
		const folders = kindFolders(['Zeppelin', 'zeppelin!', 'Drone'], ['Drone']);
		expect(folders.get('Zeppelin')).toBe('zeppelin');
		expect(folders.get('zeppelin!')).toBe('zeppelin-2');
	});
});

describe('uniqueName', () => {
	it('takes the name when it is free, and notes it', () => {
		const taken = new Set<string>();
		expect(uniqueName('42A', taken)).toBe('42A');
		expect(taken.has('42a')).toBe(true);
	});

	it('steps a name that clashes, case ignored, as macOS and Windows ignore it', () => {
		const taken = new Set<string>();
		expect(uniqueName('12a', taken)).toBe('12a');
		expect(uniqueName('12A', taken)).toBe('12A-2');
		expect(uniqueName('12A', taken)).toBe('12A-3');
	});

	it('steps a file name before its extension', () => {
		const taken = new Set<string>();
		expect(uniqueName('42A-A-reference-1', taken, '.jpg')).toBe('42A-A-reference-1.jpg');
		expect(uniqueName('42A-A-reference-1', taken, '.JPG')).toBe('42A-A-reference-1-2.JPG');
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

	it('names the annotated copy of a photo with an -annotated suffix', () => {
		expect(photoFileName('22ac', 'A', 1, 'jpg', true)).toBe('22ac-A-reference-1-annotated.jpg');
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
