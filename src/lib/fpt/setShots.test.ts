import { describe, expect, it } from 'vitest';
import {
	derivedShots,
	keyCode,
	linkIdsOf,
	matches,
	missingCodes,
	setShotData,
	setShotFilter,
	setShotKey,
	setShotsOf,
	severalCodes,
	slateSetShots,
	slateWrites,
	toMatch,
	type SetShotRow
} from './setShots';

const P = 55;
const shots = [
	{ id: 7, code: 'SMP_012_0010' },
	{ id: 8, code: 'SMP_012_0020' },
	{ id: 9, code: 'SMP_042_0010' }
];
const setShot = (id: number, code: string, linked: { id: number; code: string }[] = [], matched = false): SetShotRow => ({ id, key: setShotKey(P, code), code, shots: linked, matched });
const FIELDS = { key: 'sg_onset_key', shots: 'sg_shots', matched: 'sg_onset_matched' };

describe('setShotKey', () => {
	// A unique field ignores case and outer spaces (findings/127), as a code match does (text.md).
	// The project is in the key: whether `unique` spans projects is unmeasured (findings/136).
	it('is the project and the code as Flow PT matches it', () => {
		expect(setShotKey(P, ' smp_012_0010 ')).toBe('55:smp_012_0010');
		expect(setShotKey(P, 'SMP_012_0010')).toBe(setShotKey(P, 'smp_012_0010'));
		expect(setShotKey(56, 'SMP_012_0010')).not.toBe(setShotKey(P, 'SMP_012_0010'));
	});
	it('gives back the code it holds', () => {
		expect(keyCode(setShotKey(P, 'SMP:012'))).toBe('smp:012');
	});
});

describe('setShotFilter', () => {
	it('looks the codes up by key, in the project only', () => {
		expect(setShotFilter(P, 'sg_onset_key', ['SMP_012_0010', 'smp_012_0010 ', 'SMP_042_0010'])).toEqual({
			logical_operator: 'and',
			conditions: [
				['project', 'is', { type: 'Project', id: P }],
				['sg_onset_key', 'in', ['55:smp_012_0010', '55:smp_042_0010']]
			]
		});
	});
});

describe('setShotsOf', () => {
	// A link reads as `{id, name, type}`; a Shot's name is its code (findings/060, field_types/multi_entity.md).
	it('reads each Set Shot with its key, its name, the Shots it links by code, and whether it was matched', () => {
		const rows = [
			{
				type: 'CustomEntity22',
				id: 300,
				attributes: { sg_onset_key: '55:SMP_012_0010 ', code: 'SMP_012_0010', sg_onset_matched: true },
				relationships: { sg_shots: { data: [{ type: 'Shot', id: 7, name: 'SMP_012_0010' }] } }
			},
			{ type: 'CustomEntity22', id: 301, attributes: { sg_onset_key: '55:smp_042_0010', code: 'Hero plate', sg_onset_matched: false }, relationships: { sg_shots: { data: [] } } },
			{ type: 'CustomEntity22', id: 302, attributes: { sg_onset_key: null, code: 'x' }, relationships: {} }
		];
		expect(setShotsOf(rows, FIELDS)).toEqual([
			{ id: 300, key: '55:smp_012_0010', code: 'SMP_012_0010', shots: [{ id: 7, code: 'SMP_012_0010' }], matched: true },
			{ id: 301, key: '55:smp_042_0010', code: 'Hero plate', shots: [], matched: false }
		]);
	});
});

describe('linkIdsOf', () => {
	it('reads the ids a link field holds, each once, in order', () => {
		expect(linkIdsOf({ id: 1, relationships: { sg_shots: { data: [{ type: 'Shot', id: 9 }, { type: 'Shot', id: 7 }, { type: 'Shot', id: 9 }] } } }, 'sg_shots')).toEqual([7, 9]);
		expect(linkIdsOf({ id: 1, relationships: {} }, 'sg_shots')).toEqual([]);
	});
});

describe('missingCodes', () => {
	it('names each code that has no Set Shot yet, once, as typed', () => {
		expect(missingCodes(P, ['SMP_012_0010', ' smp_099_0010', 'SMP_099_0010', 'SMP_042_0010'], [setShot(300, 'smp_012_0010')])).toEqual(['smp_099_0010', 'SMP_042_0010']);
	});
});

describe('setShotData', () => {
	it('creates a Set Shot in the project, named by the code as typed, with its key', () => {
		expect(setShotData(P, ' SMP_012_0010 ', 'sg_onset_key')).toEqual({ project: { type: 'Project', id: P }, code: 'SMP_012_0010', sg_onset_key: '55:smp_012_0010' });
	});
});

describe('toMatch and matches', () => {
	// Kevin, #102: the app matches a Set Shot once, and a flag on it in Flow PT says so.
	it('matches only a Set Shot never matched that holds no Shot', () => {
		const sets = [setShot(300, 'SMP_012_0010'), setShot(301, 'SMP_012_0020', [], true), setShot(302, 'SMP_042_0010', [{ id: 20, code: 'EDIT_0100' }])];
		expect(toMatch(sets).map((s) => s.id)).toEqual([300]);
	});

	// Shot codes are not unique (entity_types/Shot.md): every Shot with the code (Kevin, #96).
	it('matches each to every Shot of the code typed on set, whatever it is named now', () => {
		const renamed = { ...setShot(300, 'SMP_012_0010'), code: 'Hero plate' };
		const twin = { id: 12, code: 'smp_012_0010' };
		expect(matches([renamed, setShot(301, 'SMP_099_0010')], [...shots, twin])).toEqual([{ id: 300, shots: [{ id: 7, code: 'SMP_012_0010' }, twin] }]);
	});
});

describe('derivedShots', () => {
	// Kevin, #102: the slate's Shots are the Shots of its Set Shots. The one rule, for #106 too.
	it('is every Shot of the Set Shots, each once, in order', () => {
		const sets = [setShot(300, 'A', [{ id: 9, code: 'A' }]), setShot(301, 'B', [{ id: 7, code: 'B' }, { id: 9, code: 'A' }]), setShot(302, 'C')];
		expect(derivedShots([300, 301, 302], sets)).toEqual([7, 9]);
		expect(derivedShots([302], sets)).toEqual([]);
		expect(derivedShots([999], sets)).toEqual([]);
	});
});

describe('slateSetShots', () => {
	it('is the Set Shots of the codes, those filed', () => {
		expect(slateSetShots(P, ['smp_012_0010', 'SMP_099_0010'], [setShot(300, 'SMP_012_0010'), setShot(301, 'SMP_042_0010')])).toEqual([300]);
	});
});

describe('severalCodes', () => {
	it('names a code whose Set Shot holds more than one Shot of that code; a split is not named', () => {
		const twins = setShot(300, 'SMP_012_0010', [
			{ id: 7, code: 'SMP_012_0010' },
			{ id: 12, code: 'smp_012_0010' }
		]);
		const split = setShot(301, 'SMP_012_0020', [
			{ id: 20, code: 'SMP_012_0020A' },
			{ id: 21, code: 'SMP_012_0020B' }
		]);
		expect(severalCodes(P, ['SMP_012_0010', 'SMP_012_0020', 'SMP_099_0010'], [twins, split])).toEqual(['SMP_012_0010']);
	});
});

describe('slateWrites', () => {
	const a = setShot(300, 'SMP_012_0010', [{ id: 7, code: 'SMP_012_0010' }]);
	const b = setShot(301, 'SMP_012_0020', [{ id: 8, code: 'SMP_012_0020' }]);
	const waits = setShot(302, 'SMP_099_0010');

	it('sets the Set Shots of the codes and their Shots', () => {
		expect(slateWrites(P, ['SMP_012_0010', 'SMP_099_0010'], { setShots: [], shots: [] }, [a, waits])).toEqual({ setShots: [300, 302], shots: [7] });
	});

	it('writes nothing for a field that already matches', () => {
		expect(slateWrites(P, ['SMP_012_0010'], { setShots: [300], shots: [7] }, [a])).toEqual({});
		expect(slateWrites(P, ['SMP_012_0010', 'SMP_012_0020'], { setShots: [300, 301], shots: [7] }, [a, b])).toEqual({ shots: [7, 8] });
	});

	// Kevin, #102: a link made by hand on the slate is overwritten. A wrong link is fixed on the Set Shot.
	it('overwrites what the slate holds that its Set Shots do not, and clears what a code taken off linked', () => {
		expect(slateWrites(P, ['SMP_012_0020'], { setShots: [300, 301], shots: [7, 8, 9] }, [a, b])).toEqual({ setShots: [301], shots: [8] });
		expect(slateWrites(P, [], { setShots: [300], shots: [7] }, [a])).toEqual({ setShots: [], shots: [] });
	});
});
