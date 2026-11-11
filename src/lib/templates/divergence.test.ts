import { describe, expect, it } from 'vitest';
import { applyPatch } from '$lib/model/patch';
import type { Slate, Take } from '$lib/model/types';
import { diverged, reapplyPatch, unlinkPatch } from './divergence';

const template = { id: 'tp', values: { sceneNumber: '42', lidar: true, interiorExterior: 'ext', notes: 'Rain' } };
const slate: Slate = { id: 's', shootDayId: 'd', slateUID: '42A', templateId: 'tp', sceneNumber: '42', lidar: false, notes: 'Rain' };

describe('diverged', () => {
	it('lists the template fields the record no longer holds, in template order', () => {
		expect(diverged(template, slate)).toEqual(['lidar', 'interiorExterior']);
	});
	it('ignores fields the template does not hold', () => {
		expect(diverged({ id: 'tp', values: {} }, slate)).toEqual([]);
	});
	it('counts a length the same when its metres match', () => {
		const t = { id: 'tp', values: { lensHeight: { m: 1.8288, entered: { text: `6'`, system: 'imperial' } } } };
		const take: Take = { id: 'x', slateId: 's', lensHeight: { m: 1.8288 } };
		expect(diverged(t, take)).toEqual([]);
	});
});

describe('reapplyPatch', () => {
	it('puts the template value back in every field that differs', () => {
		const patch = reapplyPatch(template, slate);
		expect(patch).toEqual([
			{ id: 's', key: 'lidar', from: false, to: true },
			{ id: 's', key: 'interiorExterior', from: undefined, to: 'ext' }
		]);
		expect(diverged(template, applyPatch([slate], patch)[0])).toEqual([]);
	});
	it('can put back only some fields', () => {
		expect(reapplyPatch(template, slate, ['lidar'])).toEqual([{ id: 's', key: 'lidar', from: false, to: true }]);
	});
});

describe('unlinkPatch', () => {
	it('clears the link and leaves every value as it is', () => {
		expect(unlinkPatch(slate)).toEqual([{ id: 's', key: 'templateId', from: 'tp', to: undefined }]);
		expect(unlinkPatch({ id: 'x' })).toEqual([]);
	});
});
