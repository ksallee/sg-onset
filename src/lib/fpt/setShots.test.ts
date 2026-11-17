import { describe, expect, it } from 'vitest';
import { heldIds, missingCodes, setShotData, setShotFilter, setShotKey, setShotMatches, setShotsOf, slateLinks, type SetShotRow } from './setShots';

const P = 55;
const shots = [
	{ id: 7, code: 'SMP_012_0010' },
	{ id: 8, code: 'SMP_012_0020' },
	{ id: 9, code: 'SMP_042_0010' }
];
const setShot = (id: number, code: string, linked: { id: number; code: string }[] = []): SetShotRow => ({ id, key: setShotKey(P, code), code, shots: linked });
const none = { link: [], unlink: [], check: [] };

describe('setShotKey', () => {
	// A unique field ignores case and outer spaces (findings/127), as a code match does (text.md).
	// The project is in the key: whether `unique` spans projects is unmeasured (findings/136).
	it('is the project and the code as Flow PT matches it', () => {
		expect(setShotKey(P, ' smp_012_0010 ')).toBe('55:smp_012_0010');
		expect(setShotKey(P, 'SMP_012_0010')).toBe(setShotKey(P, 'smp_012_0010'));
		expect(setShotKey(56, 'SMP_012_0010')).not.toBe(setShotKey(P, 'SMP_012_0010'));
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
	it('reads each Set Shot with its key, its name and the Shots it links, each by code', () => {
		const rows = [
			{
				type: 'CustomEntity22',
				id: 300,
				attributes: { sg_onset_key: '55:SMP_012_0010 ', code: 'SMP_012_0010' },
				relationships: { sg_shots: { data: [{ type: 'Shot', id: 7, name: 'SMP_012_0010' }] } }
			},
			{ type: 'CustomEntity22', id: 301, attributes: { sg_onset_key: '55:smp_042_0010', code: 'Hero plate' }, relationships: { sg_shots: { data: [] } } },
			{ type: 'CustomEntity22', id: 302, attributes: { sg_onset_key: null, code: 'x' }, relationships: {} }
		];
		expect(setShotsOf(rows, 'sg_onset_key', 'sg_shots')).toEqual([
			{ id: 300, key: '55:smp_012_0010', code: 'SMP_012_0010', shots: [{ id: 7, code: 'SMP_012_0010' }] },
			{ id: 301, key: '55:smp_042_0010', code: 'Hero plate', shots: [] }
		]);
	});
});

describe('missingCodes', () => {
	it('names each code to link that has no Set Shot yet, once, as typed', () => {
		expect(missingCodes(P, ['SMP_012_0010', ' smp_099_0010', 'SMP_099_0010', 'SMP_042_0010'], [setShot(300, 'smp_012_0010')])).toEqual(['smp_099_0010', 'SMP_042_0010']);
	});
});

describe('setShotData', () => {
	it('creates a Set Shot in the project, named by the code as typed, with its key', () => {
		expect(setShotData(P, ' SMP_012_0010 ', 'sg_onset_key')).toEqual({ project: { type: 'Project', id: P }, code: 'SMP_012_0010', sg_onset_key: '55:smp_012_0010' });
	});
});

describe('setShotMatches', () => {
	it('matches a Set Shot with no Shot yet to the Shots of its code', () => {
		const sets = [setShot(300, 'SMP_012_0010'), setShot(301, 'SMP_099_0010')];
		expect(setShotMatches(P, ['smp_012_0010', 'SMP_099_0010'], sets, shots, new Set())).toEqual([{ id: 300, shots: [{ id: 7, code: 'SMP_012_0010' }] }]);
	});

	it('matches by the code typed on set, whatever the Set Shot is named now', () => {
		const renamed = { ...setShot(300, 'SMP_012_0010'), code: 'Hero plate' };
		expect(setShotMatches(P, ['SMP_012_0010'], [renamed], shots, new Set())).toEqual([{ id: 300, shots: [{ id: 7, code: 'SMP_012_0010' }] }]);
	});

	// Shot codes are not unique (entity_types/Shot.md): every Shot with the code (Kevin, #96).
	it('matches every Shot that has the code', () => {
		const twin = { id: 12, code: 'smp_012_0010' };
		expect(setShotMatches(P, ['SMP_012_0010'], [setShot(300, 'SMP_012_0010')], [...shots, twin], new Set())).toEqual([{ id: 300, shots: [{ id: 7, code: 'SMP_012_0010' }, twin] }]);
	});

	it('leaves alone a Set Shot that holds a Shot, set by hand or by an earlier sync', () => {
		expect(setShotMatches(P, ['SMP_012_0010'], [setShot(300, 'SMP_012_0010', [{ id: 9, code: 'SMP_042_0010' }])], shots, new Set())).toEqual([]);
	});

	// Kevin, #96: a Shot a person unlinked is never linked again.
	it('never matches a Set Shot seen holding a Shot before: a person emptied it', () => {
		expect(setShotMatches(P, ['SMP_012_0010'], [setShot(300, 'SMP_012_0010')], shots, new Set([300]))).toEqual([]);
	});

	it('matches nothing for a code with no Set Shot', () => {
		expect(setShotMatches(P, ['SMP_012_0010'], [], shots, new Set())).toEqual([]);
	});
});

describe('heldIds', () => {
	it('names the Set Shots that hold a Shot', () => {
		expect(heldIds([setShot(300, 'A', [{ id: 7, code: 'A' }]), setShot(301, 'B')])).toEqual([300]);
	});
});

describe('slateLinks', () => {
	const a = setShot(300, 'SMP_012_0010', [{ id: 7, code: 'SMP_012_0010' }]);
	const b = setShot(301, 'SMP_012_0020', [{ id: 8, code: 'SMP_012_0020' }]);
	const waits = setShot(302, 'SMP_099_0010');

	it('links the Set Shot of each code and its Shots', () => {
		expect(slateLinks(P, { ...none, link: ['smp_012_0010', 'SMP_099_0010'] }, [a, waits], shots)).toEqual({
			setShots: { add: [300, 302], remove: [] },
			shots: { add: [7], remove: [] },
			waiting: ['SMP_099_0010'],
			several: [],
			removing: []
		});
	});

	// Kevin, #102: a shot editorial splits is one Set Shot with several Shots. It links them all.
	it('links every Shot a Set Shot holds, whatever their codes, and names no code for it', () => {
		const split = setShot(300, 'SMP_012_0010', [
			{ id: 20, code: 'SMP_012_0010A' },
			{ id: 21, code: 'SMP_012_0010B' }
		]);
		expect(slateLinks(P, { ...none, link: ['SMP_012_0010'] }, [split], shots)).toMatchObject({ shots: { add: [20, 21], remove: [] }, waiting: [], several: [] });
	});

	it('links the Shots of a code by its code while it has no Set Shot, and keeps it waiting', () => {
		expect(slateLinks(P, { ...none, link: ['SMP_012_0010'] }, [], shots)).toEqual({
			setShots: { add: [], remove: [] },
			shots: { add: [7], remove: [] },
			waiting: ['SMP_012_0010'],
			several: [],
			removing: []
		});
	});

	// Shot codes are not unique (entity_types/Shot.md). Kevin, #96: listed so someone cleans up.
	it('names a code when its Set Shot holds more than one Shot of that code', () => {
		const twins = setShot(300, 'SMP_012_0010', [
			{ id: 7, code: 'SMP_012_0010' },
			{ id: 12, code: 'smp_012_0010' }
		]);
		expect(slateLinks(P, { ...none, link: ['SMP_012_0010'] }, [twins], shots)).toMatchObject({ shots: { add: [7, 12], remove: [] }, waiting: [], several: ['SMP_012_0010'] });
		expect(slateLinks(P, { ...none, check: ['SMP_012_0010'] }, [twins], shots)).toEqual({
			setShots: { add: [], remove: [] },
			shots: { add: [], remove: [] },
			waiting: [],
			several: ['SMP_012_0010'],
			removing: []
		});
		expect(slateLinks(P, { ...none, check: ['SMP_012_0010'] }, [a], shots).several).toEqual([]);
	});

	it('unlinks the Set Shot of a code taken off, and the Shots it or its code linked', () => {
		const twin = { id: 12, code: 'SMP_012_0010' };
		expect(slateLinks(P, { ...none, link: ['SMP_012_0020'], unlink: ['SMP_012_0010', 'SMP_077_0010'] }, [a, b], [...shots, twin])).toEqual({
			setShots: { add: [301], remove: [300] },
			shots: { add: [8], remove: [7, 12] },
			waiting: [],
			several: [],
			removing: ['SMP_012_0010']
		});
	});

	it('never unlinks a Shot a code it holds links, nor a code whose case only changed', () => {
		const shared = setShot(301, 'SMP_012_0020', [{ id: 7, code: 'SMP_012_0010' }]);
		expect(slateLinks(P, { ...none, link: ['SMP_012_0020'], unlink: ['SMP_012_0010'] }, [a, shared], shots)).toMatchObject({
			setShots: { add: [301], remove: [300] },
			shots: { add: [7], remove: [] }
		});
		expect(slateLinks(P, { ...none, link: ['SMP_012_0010'], unlink: ['smp_012_0010'] }, [a], shots)).toMatchObject({
			setShots: { add: [300], remove: [] },
			shots: { add: [7], remove: [] },
			removing: []
		});
	});

	it('waits on a checked code once its Set Shot holds no Shot', () => {
		expect(slateLinks(P, { ...none, check: ['SMP_099_0010'] }, [waits], shots)).toMatchObject({ waiting: ['SMP_099_0010'], several: [] });
	});

	it('waits on every code when nothing is known', () => {
		expect(slateLinks(P, { ...none, link: ['SMP_012_0010'], unlink: ['SMP_012_0020'] }, [], [])).toEqual({
			setShots: { add: [], remove: [] },
			shots: { add: [], remove: [] },
			waiting: ['SMP_012_0010'],
			several: [],
			removing: []
		});
	});
});
