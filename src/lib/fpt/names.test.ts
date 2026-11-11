import { describe, expect, it } from 'vitest';
import { codeName, displayOf } from './names';

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
