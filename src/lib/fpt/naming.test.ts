import { describe, expect, it } from 'vitest';
import { ENTITY_SCOPES, ENTITY_TYPES, SET_SHOT_KEY, UUID, wantedFields, type Column } from './mapping';
import {
	CUSTOM_SCOPES,
	DEFAULT_NAMING,
	entityName,
	entityNames,
	fieldChoice,
	fieldKey,
	namingProblems,
	parseNaming,
	readNaming,
	sameNaming,
	withEntity,
	withField,
	withPrefix,
	writeNaming,
	type Naming
} from './naming';

const focal: Column = { name: 'sg_focal_length', display: 'Focal Length', dataType: 'float' };

describe('the custom scopes', () => {
	it('are the scopes whose entity is a custom one', () => {
		expect([...CUSTOM_SCOPES].sort()).toEqual(ENTITY_SCOPES.filter((s) => ENTITY_TYPES[s].kind === 'custom').sort());
	});
});

describe('the default naming', () => {
	it('names every entity and field as the app always did', () => {
		expect(entityName(DEFAULT_NAMING, 'take')).toBe('Take');
		expect(entityName(DEFAULT_NAMING, 'setShot')).toBe('Set Shot');
		expect(entityName(DEFAULT_NAMING, 'slate')).toBe('Slate');
		expect(entityNames(DEFAULT_NAMING, 'lens')).toEqual(['Lens', 'Lenses']);
		expect(entityNames(DEFAULT_NAMING, 'reference')).toEqual(['Set Reference']);
		expect(fieldChoice(DEFAULT_NAMING, 'take', focal)).toEqual({ display: 'Focal Length' });
		expect(fieldChoice(undefined, 'version', UUID)).toEqual({ display: 'Onset UUID' });
	});
});

describe('a naming', () => {
	const naming: Naming = {
		entities: { take: 'Shot Take', lens: 'Lens' },
		fields: { 'take.sg_focal_length': { display: 'Studio Focal Length' }, 'setShot.sg_onset_key': { field: 'sg_shot_key' } }
	};

	it('looks for the entity under its name alone', () => {
		expect(entityName(naming, 'take')).toBe('Shot Take');
		expect(entityNames(naming, 'take')).toEqual(['Shot Take']);
		// Named, Lens no longer takes Lenses.
		expect(entityNames(naming, 'lens')).toEqual(['Lens']);
		expect(entityNames(naming, 'cameraSetup')).toEqual(['Camera Setup']);
	});

	it('gives each field its choice, by where it is and its default name', () => {
		expect(fieldKey('take', focal)).toBe('take.sg_focal_length');
		expect(fieldChoice(naming, 'take', focal)).toEqual({ display: 'Studio Focal Length' });
		expect(fieldChoice(naming, 'lens', focal)).toEqual({ display: 'Focal Length' });
		expect(fieldChoice(naming, 'setShot', SET_SHOT_KEY)).toEqual({ field: 'sg_shot_key' });
	});

	it('is the same naming whatever the order of its keys', () => {
		const reordered: Naming = { fields: { 'setShot.sg_onset_key': { field: 'sg_shot_key' }, 'take.sg_focal_length': { display: 'Studio Focal Length' } }, entities: { lens: 'Lens', take: 'Shot Take' } };
		expect(sameNaming(naming, reordered)).toBe(true);
		expect(sameNaming(naming, DEFAULT_NAMING)).toBe(false);
		expect(sameNaming(undefined, DEFAULT_NAMING)).toBe(true);
		expect(sameNaming({ entities: {}, fields: {} }, DEFAULT_NAMING)).toBe(true);
	});
});

describe('parseNaming', () => {
	it('takes a naming whole', () => {
		const naming = { entities: { setShot: 'Shot Code' }, fields: { 'slate.sg_set_shots': { display: 'Shot Codes' }, 'note.sg_onset_key': { field: 'sg_key' } } };
		expect(parseNaming(naming)).toEqual(naming);
		expect(parseNaming({})).toEqual({});
	});

	it('refuses what is no naming', () => {
		for (const bad of [null, 'x', [], { entities: [] }, { entities: { slate: 'Plate' } }, { entities: { take: '' } }, { entities: { take: ' Take' } }, { fields: { take: { display: 'X' } } }])
			expect(parseNaming(bad)).toBeUndefined();
	});

	it('refuses a field choice that is neither a display name nor a field', () => {
		const one = (choice: unknown) => parseNaming({ fields: { 'take.sg_focal_length': choice } });
		expect(one({ display: 'Lens mm' })).toBeDefined();
		expect(one({ field: 'sg_lens_mm' })).toBeDefined();
		expect(one({})).toBeUndefined();
		expect(one({ display: 'A', field: 'sg_a' })).toBeUndefined();
		expect(one({ display: '' })).toBeUndefined();
		expect(one({ display: ' Lens mm' })).toBeUndefined();
		// A display name outside ASCII loses its name to `sg_<data_type>` (corpus findings/117).
		expect(one({ display: 'Focale ø' })).toBeUndefined();
		expect(one({ field: 'Lens mm' })).toBeUndefined();
	});

	it('refuses two custom entities under one name', () => {
		expect(parseNaming({ entities: { take: 'Camera Setup' } })).toBeUndefined();
		expect(parseNaming({ entities: { take: 'Clip', lens: 'clip' } })).toBeUndefined();
		expect(parseNaming({ entities: { take: 'Lenses' } })).toBeUndefined();
	});

	it('refuses two fields of one entity under one name', () => {
		// The end of the focal length is sg_focal_length_end already.
		expect(parseNaming({ fields: { 'take.sg_focal_length': { display: 'Focal Length End' } } })).toBeUndefined();
		expect(parseNaming({ fields: { 'take.sg_focal_length': { field: 'sg_lens_mm' }, 'take.sg_t_stop': { field: 'sg_lens_mm' } } })).toBeUndefined();
		// On two entities, one name is fine.
		expect(parseNaming({ fields: { 'take.sg_focal_length': { field: 'sg_mm' }, 'lens.sg_focal_length': { field: 'sg_mm' } } })).toBeDefined();
	});

	it('can rename every field the app wants', () => {
		const fields = Object.fromEntries(wantedFields().map(({ place, column }) => [fieldKey(place, column), { display: `Studio ${column.display}` }]));
		expect(parseNaming({ fields })).toEqual({ fields });
	});
});

// #111, the second part: the naming kept in `Project.sg_onset_naming` and in a file.
describe('the naming as text', () => {
	const naming: Naming = { entities: { take: 'Shot Take' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' }, 'lens.sg_focal_length': { field: 'sg_mm' } } };

	it('is JSON with its format, its keys in order, and reads back as the same naming', () => {
		const text = writeNaming(naming);
		expect(JSON.parse(text)).toEqual({ app: 'sg-onset', naming: 1, entities: { take: 'Shot Take' }, fields: { 'lens.sg_focal_length': { field: 'sg_mm' }, 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
		expect(readNaming(text)).toEqual({ ok: true, naming: { entities: { take: 'Shot Take' }, fields: { 'lens.sg_focal_length': { field: 'sg_mm' }, 'take.sg_t_stop': { display: 'Studio T-Stop' } } } });
		expect(sameNaming((readNaming(text) as { naming: Naming }).naming, naming)).toBe(true);
		// Flow PT strips outer spaces and newlines (corpus findings/158): the parsed value counts.
		expect(readNaming(`\n  ${JSON.stringify(JSON.parse(text), null, 2)}\n`)).toEqual(readNaming(text));
	});

	it('reads an empty field as the default names', () => {
		for (const empty of [null, undefined, '']) expect(readNaming(empty)).toEqual({ ok: true, naming: DEFAULT_NAMING });
		expect(writeNaming(DEFAULT_NAMING)).toBe('{"app":"sg-onset","naming":1,"entities":{},"fields":{}}');
	});

	it('cannot read what is no naming of this version', () => {
		for (const bad of ['{not json', '[]', '7', '{"app":"other","naming":1}', '{"app":"sg-onset","naming":2,"entities":{},"fields":{}}', '{"app":"sg-onset","naming":1,"entities":{"take":"Lens"},"fields":{}}'])
			expect(readNaming(bad)).toEqual({ ok: false });
		expect(readNaming(42)).toEqual({ ok: false });
	});
});

describe('namingProblems', () => {
	it('names what makes a naming refused, each once', () => {
		expect(namingProblems({})).toEqual([]);
		expect(namingProblems({ entities: { take: 'Clip', lens: 'clip' } })).toEqual([{ kind: 'entities', scopes: ['take', 'lens'], name: 'clip' }]);
		expect(namingProblems({ fields: { 'take.sg_focal_length': { display: 'Focal Length End' } } })).toEqual([
			{ kind: 'fields', place: 'take', keys: ['take.sg_focal_length', 'take.sg_focal_length_end'], name: 'sg_focal_length_end' }
		]);
		expect(namingProblems({ fields: { 'take.sg_t_stop': { display: 'Arrêt' }, 'take.sg_tilt': { display: ' Tilt' } } })).toEqual([
			{ kind: 'display', key: 'take.sg_t_stop' },
			{ kind: 'display', key: 'take.sg_tilt' }
		]);
	});
});

describe('changing a naming', () => {
	const tStop: Column = { name: 'sg_t_stop', display: 'T-Stop', dataType: 'float' };

	it('looks for an entity under a name, and back under its own when given its own or nothing', () => {
		expect(withEntity({}, 'take', ' Shot Take ')).toEqual({ entities: { take: 'Shot Take' } });
		expect(withEntity({ entities: { take: 'Shot Take' } }, 'take', 'take')).toEqual({ entities: {} });
		expect(withEntity({ entities: { take: 'Shot Take' } }, 'take', '')).toEqual({ entities: {} });
		// Named Lens, the lens is found under Lens or Lenses, as by default.
		expect(withEntity({}, 'lens', 'Lens')).toEqual({ entities: {} });
	});

	it('gives a field a choice, and drops one that is its default', () => {
		expect(withField({}, 'take', tStop, { display: 'Stop' })).toEqual({ fields: { 'take.sg_t_stop': { display: 'Stop' } } });
		expect(withField({ fields: { 'take.sg_t_stop': { display: 'Stop' } } }, 'take', tStop, { display: 'T-Stop' })).toEqual({ fields: {} });
		expect(withField({ fields: { 'take.sg_t_stop': { display: 'Stop' } } }, 'take', tStop, undefined)).toEqual({ fields: {} });
		expect(withField({}, 'take', tStop, { field: 'sg_stop' })).toEqual({ fields: { 'take.sg_t_stop': { field: 'sg_stop' } } });
	});

	it('names every field given with a prefix, and leaves a field mapped to one of the site alone', () => {
		const fields = [
			{ place: 'take' as const, column: focal },
			{ place: 'take' as const, column: tStop }
		];
		const mapped: Naming = { fields: { 'take.sg_t_stop': { field: 'sg_stop' } } };
		expect(withPrefix({}, ' Studio ', fields)).toEqual({ fields: { 'take.sg_focal_length': { display: 'Studio Focal Length' }, 'take.sg_t_stop': { display: 'Studio T-Stop' } } });
		expect(withPrefix(mapped, 'Studio', fields)).toEqual({ fields: { 'take.sg_t_stop': { field: 'sg_stop' }, 'take.sg_focal_length': { display: 'Studio Focal Length' } } });
		// No prefix: back to the app's own names.
		expect(withPrefix({ fields: { 'take.sg_focal_length': { display: 'Studio Focal Length' } } }, '', fields)).toEqual({ fields: {} });
	});
});
