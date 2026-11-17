import { describe, expect, it } from 'vitest';
import type { Reference, Slate, Take } from '$lib/model/types';
import { flatten, selectSlates } from './selection';
import { slateManifest } from './slateManifest';
import { day3, day4, input, kindLabel, project, s42A, sharedLighting, t42A1A } from './testData';
import { wrapPlan, type PhotoBlob, type WrapEntry } from './wrapPackage';

const blobs: PhotoBlob[] = [
	{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 100, createdAt: 2 },
	{ id: 'b1thumb', recordId: 'st1', type: 'image/jpeg', size: 10, createdAt: 3 },
	{ id: 'b2', recordId: 'st2', type: 'image/heic', size: 200, createdAt: 1 },
	{ id: 'b3', recordId: 'st3', type: 'image/jpeg', size: 300, createdAt: 4, prunedAt: 9 }
];
const ROOT = 'Night-Train_2026-11-10-day03';
const inside = (e: WrapEntry) => e.path.slice(ROOT.length + 1);

describe('wrapPlan', () => {
	const day3Input = () => {
		const all = input();
		return { rows: flatten(all, { shootDayIds: ['d3'] }), slates: selectSlates(all, { shootDayIds: ['d3'] }), references: all.references };
	};
	const plan = () => {
		const { rows, slates, references } = day3Input();
		return wrapPlan(rows, { project, shootDays: [day3], blobs, slates, references });
	};

	it('roots everything in one folder named for the project and day', () => {
		expect(plan().root).toBe(ROOT);
		for (const e of plan().entries) expect(e.path.startsWith(`${ROOT}/`)).toBe(true);
	});

	it('lists the four exports first, at the root', () => {
		const e = plan().entries;
		expect(e.slice(0, 4).map((x) => [x.kind, x.path])).toEqual([
			['crif', `${ROOT}/${ROOT}_camera-report.csv`],
			['plainCsv', `${ROOT}/${ROOT}_all-fields.csv`],
			['ale', `${ROOT}/${ROOT}_editorial.ale`],
			['json', `${ROOT}/${ROOT}_data.json`]
		]);
		expect(e[0]).toMatchObject({ mime: 'text/csv' });
		expect(e[2]).toMatchObject({ mime: 'text/plain' });
	});

	it('puts each photo in its slate folder, named as CRIF, numbered per slate and camera in shot order', () => {
		const files = plan().entries.filter((x) => x.kind === 'file');
		expect(files.map(inside)).toEqual(['42A/42A-A-reference-1.heic', '42A/42A-A-reference-2.jpg', '42A/42A-A-reference-3.jpg']);
		expect(files[0]).toMatchObject({ kind: 'file', media: 'photo', blobId: 'b2', recordId: 'st2', takeId: t42A1A.id, slateId: s42A.id, mime: 'image/heic', size: 200, pruned: false });
	});

	it('gives each set reference an empty folder in a folder for its kind, in the order logged', () => {
		const folders = plan().entries.filter((x) => x.kind === 'folder');
		expect(folders.map(inside)).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/']);
	});

	it('lists the manifest of a slate, then its files, then its reference folders, slate by slate', () => {
		expect(plan().entries.slice(4).map(inside)).toEqual([
			'9/9_manifest.csv',
			'10/10_manifest.csv',
			'42A/42A_manifest.csv',
			'42A/42A-A-reference-1.heic',
			'42A/42A-A-reference-2.jpg',
			'42A/42A-A-reference-3.jpg',
			'42A/lidar-scan/Scan-01/',
			'42A/hdri-360/HDRI_0412/'
		]);
	});

	it('gives each slate folder its manifest, named for the folder, written with the kind labels passed', () => {
		const { rows, slates, references } = day3Input();
		const p = wrapPlan(rows, { project, shootDays: [day3], blobs, slates, references, kindLabel });
		const manifest = p.entries.find((e) => e.path.endsWith('/42A_manifest.csv'));
		expect(manifest).toMatchObject({ kind: 'manifest', mime: 'text/csv', slateId: s42A.id });
		expect(manifest?.kind === 'manifest' && manifest.text).toBe(slateManifest(p.slates[2], kindLabel));
		expect(manifest?.kind === 'manifest' && manifest.text).toContain('HDRI 360,HDRI_0412,42A/hdri-360/HDRI_0412/');
	});

	it('holds every slate with a take or a reference, its takes with their files, its references with their folders', () => {
		const slates = plan().slates;
		expect(slates.map((s) => [s.slate.slateUID, s.name])).toEqual([
			['9', '9'],
			['10', '10'],
			['42A', '42A']
		]);
		const s = slates[2];
		expect(s.takes.map((t) => [t.row.take.take, t.row.cameraLetter, t.files.map((f) => f.name)])).toEqual([
			['1', 'A', ['42A-A-reference-1.heic', '42A-A-reference-2.jpg']],
			['1', 'B', []],
			['2', 'A', ['42A-A-reference-3.jpg']],
			['2', 'B', []],
			['10', 'A', []]
		]);
		expect(s.files).toEqual([]);
		expect(s.references.map((r) => [r.reference.name, r.path])).toEqual([
			['Scan 01', '42A/lidar-scan/Scan-01/'],
			['HDRI_0412', '42A/hdri-360/HDRI_0412/']
		]);
	});

	it('takes the first file of a photo, and marks one whose bytes left the device', () => {
		const files = plan().entries.filter((x) => x.kind === 'file');
		expect(files.map((p) => (p.kind === 'file' ? p.blobId : ''))).not.toContain('b1thumb');
		expect(files[2]).toMatchObject({ blobId: 'b3', pruned: true });
	});

	it('names the photos that have no file at all', () => {
		const { rows, slates, references } = day3Input();
		const p = wrapPlan(rows, { project, shootDays: [day3], blobs: blobs.filter((b) => b.recordId !== 'st3'), slates, references });
		expect(p.missingPhotos).toEqual(['st3']);
		expect(p.slates[2].takes[2].files).toEqual([]);
	});

	it('leaves out the photos on request, and keeps the reference folders', () => {
		const { rows, slates, references } = day3Input();
		const p = wrapPlan(rows, { project, shootDays: [day3], blobs, photos: false, slates, references });
		expect(p.entries.map((e) => e.kind)).toEqual(['crif', 'plainCsv', 'ale', 'json', 'manifest', 'manifest', 'manifest', 'folder', 'folder']);
		expect(p.slates[2].takes.every((t) => t.files.length === 0)).toBe(true);
	});

	it('gives a slate with references and no take in the package its folder', () => {
		const { rows, slates, references } = day3Input();
		const p = wrapPlan(
			rows.filter((r) => r.slate.id !== s42A.id),
			{ project, shootDays: [day3], blobs, slates, references }
		);
		expect(p.slates.map((s) => s.name)).toEqual(['9', '10', '42A']);
		expect(p.slates[2].takes).toEqual([]);
		expect(p.entries.filter((e) => e.kind === 'folder').map(inside)).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/']);
	});

	it('reads the references off the rows when none are passed', () => {
		const { rows } = day3Input();
		const p = wrapPlan(rows, { project, shootDays: [day3], blobs });
		expect(p.entries.filter((e) => e.kind === 'folder').map(inside)).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/']);
	});

	it('names a project kind safely, in lower case', () => {
		const all = input();
		const p = wrapPlan(flatten(all), { project, shootDays: [], blobs, slates: selectSlates(all), references: all.references, projectKinds: ['Drone survey'] });
		expect(p.entries.filter((e) => e.kind === 'folder').map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/', '50/drone-survey/Flight-1/']);
	});

	describe('names that would clash once unzipped', () => {
		const slate = (id: string, slateUID: string): Slate => ({ id, shootDayId: 'd3', slateUID });
		const take = (id: string, slateId: string): Take => ({ id, slateId, take: '1', cameraSetupId: 'csA' });
		const ref = (id: string, slateId: string, kind: string, name: string, at: string): Reference => ({ id, slateId, kind, name, loggedAt: `2026-11-10T10:${at}:00.000Z` });
		const clash = () => {
			const all = input();
			all.slates = [slate('sb', '12A'), slate('sa', '12a')];
			all.takes = [take('ta', 'sa'), take('tb', 'sb')];
			all.stills = [];
			all.references = [ref('r1', 'sa', 'hdri360', 'HDRI_0412', '01'), ref('r2', 'sa', 'hdri360', 'hdri_0412', '02'), ref('r3', 'sa', 'HDRI-360', 'HDRI_0412', '03'), ref('r4', 'sa', 'other', '', '04')];
			return wrapPlan(flatten(all, { shootDayIds: ['d3'] }), { project, shootDays: [day3], blobs: [], slates: selectSlates(all, { shootDayIds: ['d3'] }), references: all.references, projectKinds: ['HDRI-360'] });
		};

		it('steps a slate folder whose name another slate has, case ignored, and names its manifest for it', () => {
			expect(clash().slates.map((s) => s.name)).toEqual(['12a', '12A-2']);
			expect(clash().entries.filter((e) => e.kind === 'manifest').map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['12a/12a_manifest.csv', '12A-2/12A-2_manifest.csv']);
		});

		it('steps a reference folder whose name another of its kind has, and a kind folder a built-in one has', () => {
			expect(clash().slates[0].references.map((r) => r.path)).toEqual(['12a/hdri-360/HDRI_0412/', '12a/hdri-360/hdri_0412-2/', '12a/hdri-360-2/HDRI_0412/', '12a/other/reference/']);
		});
	});

	describe('a lighting reference on every slate of its lighting setup (#107)', () => {
		// 10 and 50 share 42A's lighting setup: 42A's HDRI shows on them, its scan does not.
		const packed = (day: string) => {
			const all = sharedLighting();
			const filters = { shootDayIds: [day] };
			return wrapPlan(flatten(all, filters), { project, shootDays: [day === 'd3' ? day3 : day4], blobs, slates: selectSlates(all, filters), references: all.references, allSlates: all.slates, kindLabel });
		};
		const manifest = (p: ReturnType<typeof packed>, slate: string) => {
			const e = p.entries.find((x) => x.kind === 'manifest' && x.path.endsWith(`/${slate}/${slate}_manifest.csv`));
			return e?.kind === 'manifest' ? e.text : '';
		};

		it('keeps its empty folder in the slate it was logged on, and no other', () => {
			const p = packed('d3');
			expect(p.entries.filter((e) => e.kind === 'folder').map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/']);
		});

		it('lists it in the manifest of every other slate of the lighting setup, with that folder from the package root', () => {
			const p = packed('d3');
			expect(p.slates.find((s) => s.name === '10')!.references.map((r) => [r.reference.name, r.path])).toEqual([['HDRI_0412', '42A/hdri-360/HDRI_0412/']]);
			expect(manifest(p, '10')).toContain('Reference,,,,,,,HDRI 360,HDRI_0412,42A/hdri-360/HDRI_0412/,Ricoh Theta Z1,A003,7,Noon sun');
			expect(manifest(p, '10')).not.toContain('Scan 01');
			expect(manifest(p, '9')).not.toContain('Reference');
		});

		it('gives the slate it was logged on a folder of its own when that slate is not in the package, holding only what shows here', () => {
			const p = packed('d4');
			expect(p.slates.map((s) => s.name)).toEqual(['50', '42A']);
			expect(manifest(p, '50')).toContain('HDRI 360,HDRI_0412,42A/hdri-360/HDRI_0412/');
			const logged = p.slates[1];
			expect(logged.takes).toEqual([]);
			expect(logged.references.map((r) => r.reference.name)).toEqual(['HDRI_0412']);
			expect(p.entries.slice(4).map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['50/50_manifest.csv', '50/drone-survey/Flight-1/', '42A/42A_manifest.csv', '42A/hdri-360/HDRI_0412/']);
			expect(manifest(p, '42A')).not.toContain('Scan 01');
		});

		it('gives the slate it was logged on no folder when no slate in the package shows it', () => {
			const all = sharedLighting();
			all.slates = all.slates.map((s) => (s.slateUID === '50' ? { ...s, lightingSetupId: undefined } : s));
			const filters = { shootDayIds: ['d4'] };
			const p = wrapPlan(flatten(all, filters), { project, shootDays: [day4], blobs, slates: selectSlates(all, filters), references: all.references, allSlates: all.slates });
			expect(p.slates.map((s) => s.name)).toEqual(['50']);
		});
	});
});
