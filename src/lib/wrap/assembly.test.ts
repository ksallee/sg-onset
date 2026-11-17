import { describe, expect, it } from 'vitest';
import { flatten, selectSlates } from '$lib/export/selection';
import { day3, day4, input, kindLabel, project, sharedLighting } from '$lib/export/testData';
import type { PhotoBlob } from '$lib/export/wrapPackage';
import { defaultChoice } from './choice';
import { DIAGRAM_BYTES } from '$lib/export/wrapPackage';
import { packagePlan } from './assembly';

const rows = flatten(input(), { shootDayIds: ['d3'] });
const blobs: PhotoBlob[] = [
	{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 1000, createdAt: 2 },
	{ id: 'b2', recordId: 'st2', type: 'image/jpeg', size: 2000, createdAt: 1 },
	{ id: 'b3', recordId: 'st3', type: 'image/heic', size: 3000, createdAt: 3, prunedAt: 9 }
];
const texts = { crif: 'a,b\r\n', plainCsv: 'é\r\n', ale: 'Heading\n', json: '{}' };
const base = { project, shootDays: [day3], blobs, texts, reportHtml: '<html></html>', kindLabel };

describe('packagePlan', () => {
	const plan = packagePlan(rows, defaultChoice(), base);

	it('names the zip after its folder', () => {
		expect(plan.root).toBe('Night-Train_2026-11-10-day03');
		expect(plan.fileName).toBe('Night-Train_2026-11-10-day03.zip');
	});

	it('lists the table files and the day report at the root, then each slate folder: its manifest, its photos on the device, its reference folders', () => {
		expect(plan.entries.map((e) => e.path)).toEqual([
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_camera-report.csv',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_all-fields.csv',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_editorial.ale',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_data.json',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_day-report.html',
			'Night-Train_2026-11-10-day03/9/9_manifest.csv',
			'Night-Train_2026-11-10-day03/10/10_manifest.csv',
			'Night-Train_2026-11-10-day03/42A/42A_manifest.csv',
			'Night-Train_2026-11-10-day03/42A/42A-A-reference-1.jpg',
			'Night-Train_2026-11-10-day03/42A/42A-A-reference-2.jpg',
			'Night-Train_2026-11-10-day03/42A/lidar-scan/Scan-01/',
			'Night-Train_2026-11-10-day03/42A/hdri-360/HDRI_0412/'
		]);
		expect(plan.entries[8]).toMatchObject({ kind: 'file', media: 'photo', blobId: 'b2', mime: 'image/jpeg' });
		expect(plan.entries.at(-1)).toEqual({ kind: 'folder', path: 'Night-Train_2026-11-10-day03/42A/hdri-360/HDRI_0412/', size: 0 });
	});

	it('carries the text of each manifest, with the kind labels passed', () => {
		const manifest = plan.entries[7];
		expect(manifest).toMatchObject({ kind: 'manifest', mime: 'text/csv' });
		expect(manifest.kind === 'manifest' && manifest.text).toContain('HDRI 360,HDRI_0412,42A/hdri-360/HDRI_0412/');
		expect(manifest.size).toBe(new TextEncoder().encode(manifest.kind === 'manifest' ? manifest.text : '').length);
	});

	it('counts files, not folders', () => {
		expect(plan.files).toBe(10);
	});

	it('sizes text in UTF-8 bytes, photos by their file, folders as nothing', () => {
		expect(plan.entries[1].size).toBe(4);
		expect(plan.entries[9].size).toBe(1000);
		expect(plan.photoBytes).toBe(3000);
		expect(plan.bytes).toBeGreaterThan(3000 + 5 + 4 + 8 + 2 + 13);
	});

	it('gives a slate with references and no take in the package its folder, with a project kind named safely', () => {
		const all = input();
		const p = packagePlan(rows.filter((r) => r.slate.slateUID !== '42A'), { ...defaultChoice(), files: ['crif'] }, { ...base, slates: selectSlates(all), references: all.references, projectKinds: ['Drone survey'] });
		expect(p.entries.filter((e) => e.kind === 'folder').map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['42A/lidar-scan/Scan-01/', '42A/hdri-360/HDRI_0412/', '50/drone-survey/Flight-1/']);
	});

	it('lands a lighting reference logged on another day in the folder of its slate (#107)', () => {
		const all = sharedLighting();
		const day = { shootDayIds: ['d4'] };
		const p = packagePlan(flatten(all, day), { ...defaultChoice(), files: ['crif'] }, { ...base, shootDays: [day4], slates: selectSlates(all, day), references: all.references, allSlates: all.slates, projectKinds: ['Drone survey'] });
		expect(p.entries.filter((e) => e.kind === 'folder').map((e) => e.path.split('/').slice(1).join('/'))).toEqual(['50/drone-survey/Flight-1/', '42A/hdri-360/HDRI_0412/']);
	});

	it('leaves out a pruned photo and says which take it was on', () => {
		expect(plan.pruned).toEqual([{ takeId: 't42A2A', slate: '42A', take: '2', cameraLetter: 'A', counts: { photo: 1 } }]);
	});

	it('counts the photos it holds', () => {
		expect(plan.media).toEqual({ photo: 2 });
	});

	// Kevin, 2026-11-17 (#89): each kind is counted as itself. The switch is for photos and videos;
	// audio notes always go.
	describe('videos and audio notes', () => {
		const t42A1A = rows.find((r) => r.slate.slateUID === '42A' && r.take.take === '1' && r.cameraLetter === 'A')!.take.id;
		const withNotes = flatten({ ...input(), audioNotes: [{ id: 'an1', takeId: t42A1A, capturedAt: '2026-11-10T22:30:00.000Z' }, { id: 'an2', takeId: 't42A2A', capturedAt: '2026-11-10T22:31:00.000Z' }] }, { shootDayIds: ['d3'] });
		const media: PhotoBlob[] = [
			{ id: 'b1', recordId: 'st1', type: 'video/quicktime', size: 1000, createdAt: 2 },
			{ id: 'b2', recordId: 'st2', type: 'image/jpeg', size: 2000, createdAt: 1 },
			{ id: 'b3', recordId: 'st3', type: 'video/mp4', size: 3000, createdAt: 3, prunedAt: 9 },
			{ id: 'ba1', recordId: 'an1', type: 'audio/mp4', size: 40, createdAt: 4 },
			{ id: 'ba2', recordId: 'an2', type: 'audio/webm', size: 50, createdAt: 5, prunedAt: 9 }
		];

		it('counts photos, videos and audio notes apart, and weighs photos and videos only', () => {
			const p = packagePlan(withNotes, defaultChoice(), { ...base, blobs: media });
			expect(p.media).toEqual({ photo: 1, video: 1, audio: 1 });
			expect(p.photoBytes).toBe(3000);
			expect(p.pruned).toEqual([{ takeId: 't42A2A', slate: '42A', take: '2', cameraLetter: 'A', counts: { video: 1, audio: 1 } }]);
		});

		it('keeps the audio notes with the photos and videos left out', () => {
			const p = packagePlan(withNotes, { ...defaultChoice(), files: ['crif'] }, { ...base, blobs: media });
			expect(p.media).toEqual({ audio: 1 });
			expect(p.entries.filter((e) => e.kind === 'file').map((e) => e.path.split('/').at(-1))).toEqual(['42A-A-audio-note-1.m4a']);
			expect(p.pruned).toEqual([{ takeId: 't42A2A', slate: '42A', take: '2', cameraLetter: 'A', counts: { audio: 1 } }]);
			expect(p.photoBytes).toBe(0);
		});
	});

	it('marks the annotated copy of a photo, and does not count a pruned copy as one more photo', () => {
		const copies: PhotoBlob[] = [
			...blobs,
			{ id: 'b2flat', recordId: 'st2', type: 'image/jpeg', size: 500, createdAt: 4, variant: 'annotated' },
			{ id: 'b3flat', recordId: 'st3', type: 'image/jpeg', size: 500, createdAt: 5, variant: 'annotated', prunedAt: 9 }
		];
		const p = packagePlan(rows, defaultChoice(), { ...base, blobs: copies });
		expect(p.entries.flatMap((e) => (e.kind === 'file' ? [[e.path.split('/').at(-1), e.media]] : []))).toEqual([
			['42A-A-reference-1.jpg', 'photo'],
			['42A-A-reference-1-annotated.jpg', 'annotated'],
			['42A-A-reference-2.jpg', 'photo']
		]);
		expect(p.photoBytes).toBe(3500);
		expect(p.pruned).toEqual([{ takeId: 't42A2A', slate: '42A', take: '2', cameraLetter: 'A', counts: { photo: 1 } }]);
	});

	it('holds the setup diagram of a slate, sized by guess until it is drawn, photos or not, not counted as photos', () => {
		const slateId = rows.find((r) => r.slate.slateUID === '42A')!.slate.id;
		const diagrams = [{ id: 'dg1', slateId }];
		for (const choice of [defaultChoice(), { ...defaultChoice(), files: defaultChoice().files.filter((f) => f !== 'photos') }]) {
			const p = packagePlan(rows, choice, { ...base, diagrams });
			const found = p.entries.filter((e) => e.kind === 'file' && e.media === 'diagram');
			expect(found).toEqual([{ kind: 'file', media: 'diagram', path: 'Night-Train_2026-11-10-day03/42A/42A-setup-diagram.png', mime: 'image/png', size: DIAGRAM_BYTES, blobId: '', diagramId: 'dg1' }]);
			expect(p.photoBytes).toBe(choice.files.includes('photos') ? 3000 : 0);
		}
	});

	it('lists photos with no file at all', () => {
		const p = packagePlan(rows, defaultChoice(), { ...base, blobs: blobs.slice(0, 1) });
		expect(p.missing).toEqual(['st2', 'st3']);
	});

	it('holds only what was picked', () => {
		const p = packagePlan(rows, { ...defaultChoice(), files: ['ale', 'photos'] }, base);
		expect(p.entries.map((e) => e.kind)).toEqual(['ale', 'manifest', 'manifest', 'manifest', 'file', 'file', 'folder', 'folder']);
		const none = packagePlan(rows, { ...defaultChoice(), files: ['crif'] }, base);
		expect(none.entries.map((e) => e.kind)).toEqual(['crif', 'manifest', 'manifest', 'manifest', 'folder', 'folder']);
		expect(none.pruned).toEqual([]);
	});

	it('skips a table file whose text was not made', () => {
		const p = packagePlan(rows, defaultChoice(), { ...base, texts: { crif: 'x' }, reportHtml: undefined });
		expect(p.entries.filter((e) => e.kind !== 'file' && e.kind !== 'folder' && e.kind !== 'manifest').map((e) => e.kind)).toEqual(['crif']);
	});
});
