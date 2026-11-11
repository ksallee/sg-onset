import { describe, expect, it } from 'vitest';
import { flatten } from '$lib/export/selection';
import { day3, input, project } from '$lib/export/testData';
import type { PhotoBlob } from '$lib/export/wrapPackage';
import { defaultChoice } from './choice';
import { packagePlan } from './assembly';

const rows = flatten(input(), { shootDayIds: ['d3'] });
const blobs: PhotoBlob[] = [
	{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 1000, createdAt: 2 },
	{ id: 'b2', recordId: 'st2', type: 'image/jpeg', size: 2000, createdAt: 1 },
	{ id: 'b3', recordId: 'st3', type: 'image/heic', size: 3000, createdAt: 3, prunedAt: 9 }
];
const texts = { crif: 'a,b\r\n', plainCsv: 'é\r\n', ale: 'Heading\n', json: '{}' };
const base = { project, shootDays: [day3], blobs, texts, reportHtml: '<html></html>' };

describe('packagePlan', () => {
	const plan = packagePlan(rows, defaultChoice(), base);

	it('names the zip after its folder', () => {
		expect(plan.root).toBe('Night-Train_2026-11-10-day03');
		expect(plan.fileName).toBe('Night-Train_2026-11-10-day03.zip');
	});

	it('lists the table files, the day report and the photos on the device, in that order', () => {
		expect(plan.entries.map((e) => e.path)).toEqual([
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_camera-report.csv',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_all-fields.csv',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_editorial.ale',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_data.json',
			'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_day-report.html',
			'Night-Train_2026-11-10-day03/photos/42A/take-1/42A-A-reference-1.jpg',
			'Night-Train_2026-11-10-day03/photos/42A/take-1/42A-A-reference-2.jpg'
		]);
	});

	it('sizes text in UTF-8 bytes and photos by their file', () => {
		expect(plan.entries[1].size).toBe(4);
		expect(plan.entries.at(-1)?.size).toBe(1000);
		expect(plan.photoBytes).toBe(3000);
		expect(plan.bytes).toBeGreaterThan(3000 + 5 + 4 + 8 + 2 + 13);
	});

	it('leaves out a pruned photo and says which take it was on', () => {
		expect(plan.pruned).toEqual([{ takeId: 't42A2A', slate: '42A', take: '2', cameraLetter: 'A', count: 1 }]);
	});

	it('lists photos with no file at all', () => {
		const p = packagePlan(rows, defaultChoice(), { ...base, blobs: blobs.slice(0, 1) });
		expect(p.missing).toEqual(['st2', 'st3']);
	});

	it('holds only what was picked', () => {
		const p = packagePlan(rows, { ...defaultChoice(), files: ['ale', 'photos'] }, base);
		expect(p.entries.map((e) => e.kind)).toEqual(['ale', 'photo', 'photo']);
		const none = packagePlan(rows, { ...defaultChoice(), files: ['crif'] }, base);
		expect(none.entries.map((e) => e.kind)).toEqual(['crif']);
		expect(none.pruned).toEqual([]);
	});

	it('skips a table file whose text was not made', () => {
		const p = packagePlan(rows, defaultChoice(), { ...base, texts: { crif: 'x' }, reportHtml: undefined });
		expect(p.entries.filter((e) => e.kind !== 'photo').map((e) => e.kind)).toEqual(['crif']);
	});
});
