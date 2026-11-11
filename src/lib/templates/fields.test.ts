import { describe, expect, it } from 'vitest';
import type { Slate, Take } from '$lib/model/types';
import { templateFields, valuesFrom } from './fields';

describe('templateFields', () => {
	it('a slate template holds every slate field but the slate name', () => {
		const keys = templateFields('slate').map((f) => f.key);
		expect(keys).not.toContain('slateUID');
		expect(keys).toEqual(expect.arrayContaining(['sceneNumber', 'description', 'lightingSetupId', 'interiorExterior', 'lidar', 'notes']));
	});
	it('a take template holds what carries from take to take, ends included', () => {
		const keys = templateFields('take').map((f) => f.key);
		expect(keys).toEqual(expect.arrayContaining(['tStop', 'isoSpeed', 'lensHeight', 'lensHeightEnd', 'filter', 'lensId']));
		for (const one of ['take', 'startedAt', 'endedAt', 'circleTake', 'noGood', 'notes', 'clipName', 'timecodeStart', 'timecodeEnd']) expect(keys).not.toContain(one);
	});
});

describe('valuesFrom', () => {
	it('takes the fields a template of that scope may hold, and nothing else', () => {
		const slate: Slate = { id: 's', shootDayId: 'd', slateUID: '42A', sceneNumber: '42', lidar: true, templateId: 'x' };
		expect(valuesFrom('slate', slate)).toEqual({ sceneNumber: '42', lidar: true });
		const take: Take = { id: 't', slateId: 's', take: '3', tStop: 2.8, notes: 'Boom in', tiltEnd: 4 };
		expect(valuesFrom('take', take)).toEqual({ tStop: 2.8, tiltEnd: 4 });
	});
	it('copies lists and objects, so the template does not share them with the record', () => {
		const slate: Slate = { id: 's', shootDayId: 'd', vfxShots: ['A'] };
		expect(valuesFrom('slate', slate).vfxShots).not.toBe(slate.vfxShots);
	});
});
