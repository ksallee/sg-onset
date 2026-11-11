import { describe, expect, it } from 'vitest';
import { codeName, displayOf, reverseField, slugOf } from './names';

describe('reverseField', () => {
	// corpus findings/142_reverse_field.md: an entity field makes `sg_<source display name, plural>`
	// on the linked type, shown as `<source display name> <-> <field display name>`.
	it('names the field an entity field makes on the type it links', () => {
		expect(reverseField('CustomEntity09', 'Take', 'sg_slate', 'Slate', 'entity')).toEqual({ name: 'sg_takes', displayName: 'Take <-> Slate' });
		expect(reverseField('CustomEntity10', 'Camera Setup', 'sg_lens', 'Lens', 'entity')).toEqual({ name: 'sg_camera_setups', displayName: 'Camera Setup <-> Lens' });
		expect(reverseField('Slate', 'Slate', 'sg_shoot_day', 'Shoot Day', 'entity').name).toBe('sg_slates');
		expect(reverseField('CustomEntity19', 'Lens', 'sg_x', 'X', 'entity').name).toBe('sg_lenses');
		expect(reverseField('ShootDay', 'Shoot Day', 'sg_x', 'X', 'entity').name).toBe('sg_shoot_days');
	});

	// findings/142 and 134: a multi_entity field makes `<slug>_<field>_<slug>s`, the slug singular.
	it('names the field a multi-entity field makes', () => {
		expect(reverseField('CustomEntity09', 'Take', 'sg_photos', 'Photos', 'multi_entity')).toEqual({
			name: 'custom_entity09_sg_photos_custom_entity09s',
			displayName: 'Takes <-> Photos'
		});
	});
});

describe('displayOf', () => {
	it('splits a camelCase key into capitalised words', () => {
		expect(displayOf('focalLength')).toBe('Focal Length');
		expect(displayOf('tStop')).toBe('T Stop');
		expect(displayOf('take')).toBe('Take');
		expect(displayOf('distanceToSubject')).toBe('Distance To Subject');
	});

	it('keeps a run of capitals together', () => {
		expect(displayOf('slateUID')).toBe('Slate UID');
		expect(displayOf('vfxShots')).toBe('Vfx Shots');
	});
});

describe('codeName', () => {
	// corpus findings/117_field_types_and_names.md: "sg_" + re.sub(r"[^a-z0-9_]", "_", display.lower())
	it('follows the rule the server derives names by', () => {
		expect(codeName('Focal Length')).toBe('sg_focal_length');
		expect(codeName('zzprobe 019 With (Parens)')).toBe('sg_zzprobe_019_with__parens_');
		expect(codeName('zzprobe 117 a--b..c!!d  e_f')).toBe('sg_zzprobe_117_a__b__c__d__e_f');
		expect(codeName('117 zzprobe digit')).toBe('sg_117_zzprobe_digit');
		expect(codeName('Focus Distance m')).toBe('sg_focus_distance_m');
	});
});

describe('slugOf', () => {
	// corpus findings/122_onset_entity_types.md: shoot_days resolves, shootdays does not. The probe
	// of findings/123_photos_per_record.md addressed a custom entity as custom_entity19s.
	it('is the lowercased, underscored plural the REST paths take', () => {
		expect(slugOf('Slate')).toBe('slates');
		expect(slugOf('Camera')).toBe('cameras');
		expect(slugOf('ShootDay')).toBe('shoot_days');
		expect(slugOf('CustomEntity19')).toBe('custom_entity19s');
		expect(slugOf('Attachment')).toBe('attachments');
		expect(slugOf('Project')).toBe('projects');
	});
});
