import { describe, expect, it } from 'vitest';
import { createData, fromRow, readFields, updateData } from './payload';
import { RESOLUTION, STEPPED_ASIDE } from './testkit';

const PROJECT = 70;
const links = { p1: 70, d1: 11, s1: 21, c1: 31, l1: 41, cs1: 51, ls1: 61 };
const ok = <T>(r: { ok: true; data: T } | { ok: false; message: string }): T => {
	if (!r.ok) throw new Error(r.message);
	return r.data;
};

describe('createData', () => {
	it('builds a take: project, client UUID, links, fields, and the capture time as created_at', () => {
		const data = ok(
			createData(
				RESOLUTION,
				'take',
				't1',
				{
					slateId: 's1',
					cameraSetupId: 'cs1',
					cameraId: 'c1',
					lensId: 'l1',
					take: '3',
					startedAt: '2026-11-11T10:22:33.456Z',
					endedAt: '2026-11-11T10:23:40.000Z',
					circleTake: true,
					focalLength: 50,
					focalLengthEnd: 85,
					tStop: 2.8,
					focusDistance: { m: 'inf' },
					lensHeight: { m: 1.8288, entered: { text: "6'", system: 'imperial' } },
					captureFrameRate: { num: 24000, denom: 1001 },
					isoSpeed: 800,
					templateId: 'tpl1'
				},
				links,
				PROJECT
			)
		);
		expect(data).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 't1',
			// corpus findings/070_authored_timestamps.md: created_at is stored as sent on a create.
			created_at: '2026-11-11T10:22:33Z',
			sg_slate: { type: 'Slate', id: 21 },
			sg_camera_setup: { type: 'CustomEntity10', id: 51 },
			sg_camera: { type: 'Camera', id: 31 },
			sg_lens: { type: 'CustomEntity19', id: 41 },
			code: '3',
			sg_start_time: '2026-11-11T10:22:33Z',
			sg_end_time: '2026-11-11T10:23:40Z',
			sg_circled: true,
			sg_focal_length: '50.0',
			sg_focal_length_end: '85.0',
			sg_t_stop: '2.8',
			sg_focus_distance_m: '1000000000.0',
			sg_lens_height_m: '1.8288',
			sg_frame_rate: '24000/1001',
			sg_iso: 800,
			sg_onset_template: 'tpl1'
		});
	});

	it('leaves out what the record does not hold: no nulls on a create', () => {
		const data = ok(createData(RESOLUTION, 'take', 't1', { slateId: 's1', take: '1' }, links, PROJECT));
		expect(data).toEqual({ project: { type: 'Project', id: 70 }, sg_onset_uuid: 't1', sg_slate: { type: 'Slate', id: 21 }, code: '1' });
	});

	it('builds each of the other scopes', () => {
		expect(ok(createData(RESOLUTION, 'shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11', shootDay: 12, cameraUnit: 'Main' }, links, PROJECT))).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 'd1',
			code: '2026-11-11',
			sg_shoot_date: '2026-11-11',
			sg_day_number: 12,
			sg_unit: 'Main'
		});
		expect(
			ok(
				createData(
					RESOLUTION,
					'slate',
					's1',
					{ shootDayId: 'd1', slateUID: '42A', lightingSetupId: 'ls1', description: 'Wide', vfxShots: ['SH010'], lidar: true, notes: 'wet' },
					links,
					PROJECT
				)
			)
		).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 's1',
			sg_shoot_day: { type: 'ShootDay', id: 11 },
			code: '42A',
			sg_lighting_setup: { type: 'CustomEntity11', id: 61 },
			description: 'Wide',
			sg_vfx_shots: 'SH010',
			sg_lidar: true,
			sg_set_notes: 'wet'
		});
		expect(ok(createData(RESOLUTION, 'cameraSetup', 'cs1', { projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' }, links, PROJECT))).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 'cs1',
			code: 'A',
			sg_camera: { type: 'Camera', id: 31 },
			sg_lens: { type: 'CustomEntity19', id: 41 }
		});
		expect(ok(createData(RESOLUTION, 'lightingSetup', 'ls1', { projectId: 'p1', label: 'Day ext', hdri: true }, links, PROJECT))).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 'ls1',
			code: 'Day ext',
			sg_hdri: true
		});
		expect(
			ok(
				createData(
					RESOLUTION,
					'camera',
					'c1',
					{ projectId: 'p1', cameraModel: 'Alexa 35', activeSensorPhysicalDimensions: { width: 27.99, height: 19.22 } },
					links,
					PROJECT
				)
			)
		).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 'c1',
			code: 'Alexa 35',
			sg_sensor_width_mm: '27.99',
			sg_sensor_height_mm: '19.22'
		});
		expect(
			ok(createData(RESOLUTION, 'lens', 'l1', { projectId: 'p1', lensModel: 'Master Prime 50', focalLength: 50, anamorphicSqueeze: { num: 2, denom: 1 } }, links, PROJECT))
		).toEqual({
			project: { type: 'Project', id: 70 },
			sg_onset_uuid: 'l1',
			code: 'Master Prime 50',
			sg_focal_length: '50.0',
			sg_anamorphic_squeeze: '2/1'
		});
	});

	it('writes to the field the site really has', () => {
		const data = ok(createData(STEPPED_ASIDE, 'lens', 'l1', { projectId: 'p1', lensModel: 'MP', focalLength: 50 }, links, PROJECT));
		expect(data).toMatchObject({ sg_onset_focal_length: '50.0' });
		expect(data).not.toHaveProperty('sg_focal_length');
	});

	// corpus recipes/002_batch.md: a create in a batch skips validation, so a link is checked here.
	it('refuses a link to a record the server does not have yet', () => {
		expect(createData(RESOLUTION, 'take', 't1', { slateId: 's9', take: '1' }, links, PROJECT)).toEqual({
			ok: false,
			message: expect.stringContaining('slateId')
		});
	});

	it('refuses a record of another project', () => {
		expect(createData(RESOLUTION, 'camera', 'c1', { projectId: 'p1', cameraModel: 'X' }, { p1: 99 }, PROJECT)).toEqual({
			ok: false,
			message: expect.stringContaining('project')
		});
	});

	it('refuses a key it has no field for, loudly', () => {
		expect(createData(RESOLUTION, 'take', 't1', { slateId: 's1', mood: 'tense' }, links, PROJECT)).toEqual({
			ok: false,
			message: expect.stringContaining('take.mood')
		});
	});

	it('refuses a value of the wrong shape', () => {
		expect(createData(RESOLUTION, 'take', 't1', { slateId: 's1', focalLength: 'fifty' }, links, PROJECT).ok).toBe(false);
	});
});

describe('updateData', () => {
	const edit = (value: unknown, base: unknown = undefined) => ({ base, value });

	it('sends only the fields that changed', () => {
		expect(ok(updateData(RESOLUTION, 'take', { tStop: edit(4, 2.8), circleTake: edit(true) }, {}, PROJECT))).toEqual({ sg_t_stop: '4.0', sg_circled: true });
	});

	// corpus findings/field_types: null clears text, float, number, date_time and entity; a checkbox takes false.
	it('clears a field with null, and a checkbox with false', () => {
		expect(
			ok(
				updateData(
					RESOLUTION,
					'take',
					{ tStop: edit(undefined, 4), notes: edit(undefined, 'x'), circleTake: edit(undefined, true), lensId: edit(undefined, 'l1') },
					{},
					PROJECT
				)
			)
		).toEqual({ sg_t_stop: null, sg_set_notes: null, sg_circled: false, sg_lens: null });
		expect(ok(updateData(RESOLUTION, 'camera', { activeSensorResolution: edit(undefined) }, {}, PROJECT))).toEqual({
			sg_sensor_resolution_width: null,
			sg_sensor_resolution_height: null
		});
	});

	it('relinks with the server id of the new record', () => {
		expect(ok(updateData(RESOLUTION, 'take', { lensId: edit('l1', 'l0') }, links, PROJECT))).toEqual({ sg_lens: { type: 'CustomEntity19', id: 41 } });
		expect(updateData(RESOLUTION, 'take', { lensId: edit('l9') }, links, PROJECT).ok).toBe(false);
	});

	it('renames a shoot day with its date', () => {
		expect(ok(updateData(RESOLUTION, 'shootDay', { shootDate: edit('2026-11-12', '2026-11-11') }, {}, PROJECT))).toEqual({
			sg_shoot_date: '2026-11-12',
			code: '2026-11-12'
		});
	});

	// findings/070: created_at is editable on create only.
	it('never sends created_at', () => {
		expect(ok(updateData(RESOLUTION, 'take', { startedAt: edit('2026-11-11T10:00:00Z') }, {}, PROJECT))).toEqual({ sg_start_time: '2026-11-11T10:00:00Z' });
	});

	it('refuses an unknown key', () => {
		expect(updateData(RESOLUTION, 'take', { mood: edit('x') }, {}, PROJECT).ok).toBe(false);
	});
});

describe('readFields', () => {
	it('asks for the FPT fields behind our keys', () => {
		expect(readFields(RESOLUTION, 'take', ['tStop', 'focusDistance', 'circleTake'])).toEqual(['sg_t_stop', 'sg_focus_distance_m', 'sg_circled']);
		expect(readFields(RESOLUTION, 'camera', ['activeSensorResolution'])).toEqual(['sg_sensor_resolution_width', 'sg_sensor_resolution_height']);
		expect(readFields(STEPPED_ASIDE, 'lens', ['focalLength'])).toEqual(['sg_onset_focal_length']);
	});

	// corpus findings/field_types/entity.md: a dotted path reads through a single link, typed.
	it('asks for the client UUID of a linked record through the link', () => {
		expect(readFields(RESOLUTION, 'take', ['lensId'])).toEqual(['sg_lens', 'sg_lens.CustomEntity19.sg_onset_uuid']);
		expect(readFields(RESOLUTION, 'slate', ['shootDayId'])).toEqual(['sg_shoot_day', 'sg_shoot_day.ShootDay.sg_onset_uuid']);
	});

	it('skips a key it does not know', () => {
		expect(readFields(RESOLUTION, 'take', ['mood'])).toEqual([]);
	});
});

describe('fromRow', () => {
	// Row shape: corpus endpoints/post_entity_type_search.md; links under relationships (field_types/entity.md).
	const row = {
		type: 'CustomEntity09',
		id: 900,
		attributes: {
			sg_t_stop: '2.8',
			sg_circled: false,
			sg_focus_distance_m: '1000000000.0',
			sg_iso: null,
			code: '3',
			'sg_lens.CustomEntity19.sg_onset_uuid': 'l1'
		},
		relationships: { sg_lens: { data: { type: 'CustomEntity19', id: 41, name: 'MP 50' } }, sg_camera: { data: null } }
	};

	it('gives the server values in our field form, for the keys asked', () => {
		expect(fromRow(RESOLUTION, 'take', row, ['tStop', 'circleTake', 'focusDistance', 'isoSpeed', 'take', 'lensId', 'cameraId'])).toEqual({
			tStop: 2.8,
			focusDistance: { m: 'inf' },
			take: '3',
			lensId: 'l1'
		});
	});

	it('names a link to a record that is not ours, so it never passes for one of ours', () => {
		const foreign = { ...row, attributes: { 'sg_lens.CustomEntity19.sg_onset_uuid': null } };
		expect(fromRow(RESOLUTION, 'take', foreign, ['lensId'])).toEqual({ lensId: 'fpt:CustomEntity19:41' });
	});

	it('reads through the field the site really has', () => {
		const lens = { type: 'CustomEntity19', id: 41, attributes: { sg_onset_focal_length: '50.0', sg_focal_length: '50mm' }, relationships: {} };
		expect(fromRow(STEPPED_ASIDE, 'lens', lens, ['focalLength'])).toEqual({ focalLength: 50 });
	});
});
