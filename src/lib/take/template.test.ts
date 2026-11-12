import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { groupTakes } from './groups';
import { groupChanged, groupLink, groupLinkPatch, groupResetPatch, groupUnlinkPatch } from './template';

const take = (id: string, setup: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: '3', cameraSetupId: setup, ...rest });
const group = (...takes: Take[]) => groupTakes(takes)[0];
const day = { id: 'tp', values: { isoSpeed: 800, shutterAngle: 180, cameraSetupId: 'A', lensId: 'L1' } };

describe('groupLink', () => {
	it('is none when no camera is linked', () => {
		expect(groupLink(group(take('a', 'A'), take('b', 'B')))).toEqual({ kind: 'none' });
	});
	it('is the template every camera is linked to', () => {
		expect(groupLink(group(take('a', 'A', { templateId: 'tp' }), take('b', 'B', { templateId: 'tp' })))).toEqual({ kind: 'one', id: 'tp' });
	});
	it('is mixed when the cameras differ', () => {
		expect(groupLink(group(take('a', 'A', { templateId: 'tp' }), take('b', 'B')))).toEqual({ kind: 'mixed' });
		expect(groupLink(group(take('a', 'A', { templateId: 'tp' }), take('b', 'B', { templateId: 'other' })))).toEqual({ kind: 'mixed' });
	});
});

describe('groupLinkPatch', () => {
	it('links every camera and fills the template values, leaving each camera its setup, body and lens', () => {
		const g = group(take('a', 'A', { isoSpeed: 800 }), take('b', 'B', { lensId: 'L2' }));
		expect(groupLinkPatch(g, day)).toEqual([
			{ id: 'a', key: 'templateId', from: undefined, to: 'tp' },
			{ id: 'a', key: 'shutterAngle', from: undefined, to: 180 },
			{ id: 'b', key: 'templateId', from: undefined, to: 'tp' },
			{ id: 'b', key: 'isoSpeed', from: undefined, to: 800 },
			{ id: 'b', key: 'shutterAngle', from: undefined, to: 180 }
		]);
	});
	it('is empty when every camera already follows it', () => {
		const g = group(take('a', 'A', { templateId: 'tp', isoSpeed: 800, shutterAngle: 180 }));
		expect(groupLinkPatch(g, day)).toEqual([]);
	});
});

describe('groupChanged', () => {
	it('lists the fields any camera changed, in template order, never the camera fields', () => {
		const g = group(take('a', 'A', { templateId: 'tp', isoSpeed: 800, shutterAngle: 90 }), take('b', 'B', { templateId: 'tp', isoSpeed: 1600, shutterAngle: 180 }));
		expect(groupChanged(g, day)).toEqual(['isoSpeed', 'shutterAngle']);
	});
});

describe('groupResetPatch', () => {
	it('puts the template values back on every camera, not the camera fields', () => {
		const g = group(take('a', 'A', { templateId: 'tp', isoSpeed: 800, shutterAngle: 90 }), take('b', 'B', { templateId: 'tp', isoSpeed: 1600, shutterAngle: 180 }));
		expect(groupResetPatch(g, day)).toEqual([
			{ id: 'a', key: 'shutterAngle', from: 90, to: 180 },
			{ id: 'b', key: 'isoSpeed', from: 1600, to: 800 }
		]);
	});
});

describe('groupUnlinkPatch', () => {
	it('clears the link on the cameras that have one', () => {
		const g = group(take('a', 'A', { templateId: 'tp', isoSpeed: 800 }), take('b', 'B'));
		expect(groupUnlinkPatch(g)).toEqual([{ id: 'a', key: 'templateId', from: 'tp', to: undefined }]);
	});
});
