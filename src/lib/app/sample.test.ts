import { describe, expect, it } from 'vitest';
import type { Scope } from '$lib/model/catalogue';
import { validateRecord } from '$lib/model/validate';
import { dependsOn } from '$lib/store/tables';
import { SAMPLE_NAME, sampleProject, sampleRows } from './sample';

function build() {
	let n = 0;
	return sampleProject({ newId: () => `id${++n}`, now: new Date(2026, 10, 11, 15, 30) });
}

describe('sampleProject', () => {
	it('says it is a sample', () => {
		expect(build().project.name).toBe(SAMPLE_NAME);
		expect(SAMPLE_NAME).toMatch(/sample/i);
	});
	it('has two days ending today, gear, setups, slates and takes', () => {
		const s = build();
		expect(s.shootDays.map((d) => d.shootDate)).toEqual(['2026-11-10', '2026-11-11']);
		expect([s.cameras.length, s.lenses.length, s.cameraSetups.length, s.lightingSetups.length]).toEqual([2, 3, 2, 2]);
		expect(s.slates.map((x) => x.slateUID)).toEqual(['12A', '12B', '42A', '42B']);
		expect(s.takes.length).toBeGreaterThan(6);
	});
	it('gives every record its own id', () => {
		const ids = sampleRows(build()).map((r) => r.row.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('is valid by the model, record by record', () => {
		for (const { table, row } of sampleRows(build())) {
			expect(validateRecord(table as Scope, row), `${table} ${row.id}`).toEqual({});
		}
	});
	it('has a prime and a zoom, and the zoom takes carry their focal length', () => {
		const s = build();
		const zoom = s.lenses.find((l) => l.focalLengthMax)!;
		expect(s.takes.filter((t) => t.lensId === zoom.id).every((t) => typeof t.focalLength === 'number')).toBe(true);
		expect(s.takes.filter((t) => t.lensId !== zoom.id).every((t) => t.focalLength === undefined)).toBe(true);
	});
	it('ends before now', () => {
		const now = new Date(2026, 10, 11, 15, 30).getTime();
		expect(build().takes.every((t) => Date.parse(t.endedAt!) < now)).toBe(true);
	});
});

describe('sampleRows', () => {
	it('lists every record after the ones it links to', () => {
		const seen = new Set<string>();
		for (const { table, row } of sampleRows(build())) {
			for (const id of dependsOn(table, row as Record<string, unknown>)) expect(seen.has(id), `${table} ${row.id} links to ${id}`).toBe(true);
			seen.add(row.id);
		}
		expect(seen.size).toBeGreaterThan(20);
	});
});
