import { describe, expect, it } from 'vitest';
import { create, del, entry, update } from '$lib/outbox/testkit';
import type { Entry, EntryState } from '$lib/outbox/types';
import { keepKept, keptHref, listsWaiting, mergeShared, usedIds, USERS, type LocalState, type PulledTable } from './shared';

const P = 'p1';
const KEYS = ['lensMake', 'lensModel', 'lensSerialNumber', 'focalLength', 'focalLengthMax', 'anamorphicSqueeze'];

const cooke = { id: 'l1', projectId: P, lensMake: 'Cooke', lensModel: 'S4/i 32mm', focalLength: 32 };
const zeiss = { id: 'l2', projectId: P, lensMake: 'Zeiss', lensModel: 'Supreme 50mm', focalLength: 50 };

/** What Flow PT holds: the lenses of the project, each with its server id. */
function pulled(records: { id: string; remoteId?: number; fields: Record<string, unknown> }[], complete = true): PulledTable {
	return { table: 'lens', keys: KEYS, complete, records: records.map((r, i) => ({ id: r.id, remoteId: r.remoteId ?? 900 + i, fields: r.fields })) };
}
const held = (row: Record<string, unknown>) => {
	const { id: _id, projectId: _p, ...fields } = row;
	return fields;
};

function local(over: Partial<LocalState> = {}): LocalState {
	return { projectId: P, rows: [], remotes: {}, entries: [], trashed: new Set(), used: new Set(), ...over };
}

const pending = (op: Parameters<typeof entry>[0], state: EntryState = 'pending'): Entry => entry(op, { state });

const NOTHING = { add: [], change: [], remove: [], kept: [], resend: [], push: [], remoteIds: {} };

describe('mergeShared: new', () => {
	it('adds a record made on another device, under this project, and keeps its server id', () => {
		const plan = mergeShared(pulled([{ id: 'l1', remoteId: 901, fields: held(cooke) }]), local());
		expect(plan).toEqual({ ...NOTHING, add: [cooke], remoteIds: { l1: 901 } });
	});

	it('starts a new device with every list', () => {
		const plan = mergeShared(pulled([{ id: 'l1', fields: held(cooke) }, { id: 'l2', fields: held(zeiss) }]), local());
		expect(plan.add.map((r) => r.id)).toEqual(['l1', 'l2']);
		expect(plan.add.every((r) => r.projectId === P)).toBe(true);
	});

	it('does not bring back a record removed here whose delete is on its way', () => {
		const plan = mergeShared(pulled([{ id: 'l1', fields: held(cooke) }]), local({ trashed: new Set(['l1']), remotes: { l1: 900 }, entries: [pending(del('lens', 'l1'))] }));
		expect(plan).toEqual(NOTHING);
	});
});

describe('mergeShared: changed on another device', () => {
	it('takes the values Flow PT holds, and clears a value it no longer holds', () => {
		const there = { ...held(cooke), lensModel: 'S4/i 32 mm', focalLength: undefined };
		const plan = mergeShared(pulled([{ id: 'l1', fields: there }]), local({ rows: [cooke], remotes: { l1: 900 } }));
		expect(plan).toEqual({ ...NOTHING, change: [{ id: 'l1', set: { lensModel: 'S4/i 32 mm', focalLength: undefined } }] });
	});

	it('changes nothing when the values are the same, as the model compares them', () => {
		const typed = { ...cooke, focalLength: 32, lensMake: 'Cooke' };
		const plan = mergeShared(pulled([{ id: 'l1', fields: held(cooke) }]), local({ rows: [typed], remotes: { l1: 900 } }));
		expect(plan).toEqual(NOTHING);
	});

	it('looks only at the keys Flow PT holds: a key of the device alone is left', () => {
		const row = { ...cooke, picked: true };
		const plan = mergeShared(pulled([{ id: 'l1', fields: held(cooke) }]), local({ rows: [row], remotes: { l1: 900 } }));
		expect(plan).toEqual(NOTHING);
	});

	it('keeps the server id of a record that has none here yet', () => {
		const plan = mergeShared(pulled([{ id: 'l1', remoteId: 950, fields: held(cooke) }]), local({ rows: [cooke] }));
		expect(plan).toEqual({ ...NOTHING, remoteIds: { l1: 950 } });
	});
});

describe('mergeShared: changed here, not yet synced', () => {
	it('never overwrites a field edited here: the other fields still follow Flow PT', () => {
		const mine = { ...cooke, lensModel: 'S4/i 32mm T2' };
		const there = { ...held(cooke), lensModel: 'Cooke 32', lensSerialNumber: 'C-0032' };
		const plan = mergeShared(
			pulled([{ id: 'l1', fields: there }]),
			local({ rows: [mine], remotes: { l1: 900 }, entries: [pending(update('lens', 'l1', { lensModel: ['S4/i 32mm', 'S4/i 32mm T2'] }))] })
		);
		expect(plan).toEqual({ ...NOTHING, change: [{ id: 'l1', set: { lensSerialNumber: 'C-0032' } }] });
	});

	it('holds a field edited here in every state but confirmed: sent, maybe sent, failed, or waiting for a person', () => {
		for (const state of ['inFlight', 'sentUnconfirmed', 'failedRetryable', 'needsAttention'] as const) {
			const plan = mergeShared(
				pulled([{ id: 'l1', fields: { ...held(cooke), lensModel: 'Other' } }]),
				local({ rows: [cooke], remotes: { l1: 900 }, entries: [pending(update('lens', 'l1', { lensModel: ['Old', 'S4/i 32mm'] }), state)] })
			);
			expect(plan.change).toEqual([]);
		}
	});

	it('takes nothing for a record whose create has not been confirmed: the device has it whole', () => {
		const plan = mergeShared(
			pulled([{ id: 'l1', fields: { ...held(cooke), lensModel: 'Other' } }]),
			local({ rows: [cooke], entries: [pending(create('lens', 'l1', held(cooke)), 'sentUnconfirmed')] })
		);
		expect(plan).toEqual(NOTHING);
	});
});

describe('mergeShared: removed on another device', () => {
	it('removes here a record Flow PT no longer holds that nothing here uses', () => {
		const plan = mergeShared(pulled([{ id: 'l2', fields: held(zeiss) }]), local({ rows: [cooke, zeiss], remotes: { l1: 900, l2: 901 } }));
		expect(plan).toEqual({ ...NOTHING, remove: ['l1'] });
	});

	it('keeps one in use here, lists it, and sends it back', () => {
		const plan = mergeShared(pulled([]), local({ rows: [cooke], remotes: { l1: 900 }, used: new Set(['l1']) }));
		expect(plan).toEqual({ ...NOTHING, kept: ['l1'], resend: ['l1'] });
	});

	it('keeps one edited here and not yet synced: the edit is never lost', () => {
		const plan = mergeShared(pulled([]), local({ rows: [cooke], remotes: { l1: 900 }, entries: [pending(update('lens', 'l1', { focalLength: [35, 32] }))] }));
		expect(plan).toEqual({ ...NOTHING, kept: ['l1'], resend: ['l1'] });
	});

	it('keeps one whose edit may be on its way, and sends it back at a later sync', () => {
		const plan = mergeShared(
			pulled([]),
			local({ rows: [cooke], remotes: { l1: 900 }, used: new Set(['l1']), entries: [pending(update('lens', 'l1', { focalLength: [35, 32] }), 'inFlight')] })
		);
		expect(plan).toEqual({ ...NOTHING, kept: ['l1'] });
	});

	it('judges nothing removed from a read that did not reach the end of the list', () => {
		const plan = mergeShared(pulled([], false), local({ rows: [cooke], remotes: { l1: 900 } }));
		expect(plan).toEqual(NOTHING);
	});
});

describe('mergeShared: only here', () => {
	it('sends a record Flow PT never had and nothing is queued for: a list kept on the device before it was shared', () => {
		const plan = mergeShared(pulled([]), local({ rows: [cooke] }));
		expect(plan).toEqual({ ...NOTHING, push: ['l1'] });
	});

	it('leaves one whose create waits in the queue', () => {
		const plan = mergeShared(pulled([]), local({ rows: [cooke], entries: [pending(create('lens', 'l1', held(cooke)))] }));
		expect(plan).toEqual(NOTHING);
	});

	it('leaves the records of other projects alone', () => {
		const other = { ...cooke, id: 'l9', projectId: 'p2' };
		const plan = mergeShared(pulled([{ id: 'l1', fields: held(cooke) }]), local({ rows: [other], remotes: { l9: 77 } }));
		expect(plan).toEqual({ ...NOTHING, add: [cooke], remoteIds: { l1: 900 } });
	});
});

describe('mergeShared: the lists Flow PT has no entity for', () => {
	const template = { id: 'tp1', projectId: P, name: 'Day ext', scope: 'take', values: { tStop: 2.8 } };
	const list = (records: { id: string; fields: Record<string, unknown> }[]): PulledTable => ({
		table: 'template',
		keys: ['name', 'scope', 'values'],
		complete: true,
		records: records.map((r) => ({ ...r, remoteId: r.id }))
	});

	it('takes a template edited elsewhere, its values whole', () => {
		const plan = mergeShared(list([{ id: 'tp1', fields: { name: 'Day ext', scope: 'take', values: { tStop: 4 } } }]), local({ rows: [template], remotes: { tp1: 'tp1' } }));
		expect(plan.change).toEqual([{ id: 'tp1', set: { values: { tStop: 4 } } }]);
	});

	it('keeps a template that entries here were made from', () => {
		const plan = mergeShared(list([]), local({ rows: [template], remotes: { tp1: 'tp1' }, used: new Set(['tp1']) }));
		expect(plan.kept).toEqual(['tp1']);
	});
});

describe('listsWaiting', () => {
	it('counts the changes to templates and reference kinds not yet confirmed', () => {
		const queue = [
			pending(create('template', 'tp1')),
			pending(update('referenceKind', 'k1', { name: ['a', 'b'] }), 'needsAttention'),
			pending(create('lens', 'l1')),
			pending(del('template', 'tp2'), 'confirmed')
		];
		expect(listsWaiting(queue)).toBe(2);
	});
});

describe('keepKept', () => {
	it('lists what was kept this session, then what a pull kept, each once', () => {
		const before = [{ table: 'lens' as const, id: 'l1' }];
		expect(keepKept(before, [{ table: 'lens', id: 'l1' }, { table: 'template', id: 'tp1' }])).toEqual([
			{ table: 'lens', id: 'l1' },
			{ table: 'template', id: 'tp1' }
		]);
		expect(keepKept([], [])).toEqual([]);
	});
});

describe('keptHref', () => {
	it('opens a camera or a lens in Gear, a template in Templates, a kind in Settings', () => {
		expect(keptHref({ table: 'lens', id: 'l1' })).toBe('/gear?sel=lens.l1');
		expect(keptHref({ table: 'camera', id: 'c 1' })).toBe('/gear?sel=camera.c%201');
		expect(keptHref({ table: 'template', id: 'tp1' })).toBe('/templates/tp1');
		expect(keptHref({ table: 'referenceKind', id: 'k1' })).toBe('/settings');
		expect(keptHref({ table: 'lightingSetup', id: 'ls1' })).toBeUndefined();
	});
});

describe('usedIds', () => {
	it('names the cameras and lenses that a take or a camera setup holds', () => {
		const users = {
			take: [{ id: 't1', cameraId: 'c1', lensId: 'l1' }],
			cameraSetup: [{ id: 'cs1', cameraId: 'c2', lensId: 'l2' }]
		};
		expect([...usedIds('camera', users, [])].sort()).toEqual(['c1', 'c2']);
		expect([...usedIds('lens', users, [])].sort()).toEqual(['l1', 'l2']);
		expect(USERS.lens).toEqual(['take', 'cameraSetup']);
	});

	it('names the lighting setups that a slate holds', () => {
		expect([...usedIds('lightingSetup', { slate: [{ id: 's1', lightingSetupId: 'ls1' }, { id: 's2' }] }, [])]).toEqual(['ls1']);
	});

	it('names the templates that a slate or a take was made from', () => {
		expect([...usedIds('template', { slate: [{ id: 's1', templateId: 'tp1' }], take: [{ id: 't1', templateId: 'tp2' }] }, [])].sort()).toEqual(['tp1', 'tp2']);
	});

	it('names the kinds a reference holds, by name, case and outer spaces aside', () => {
		const kinds = [
			{ id: 'k1', projectId: P, name: 'Drone scan' },
			{ id: 'k2', projectId: P, name: 'Sky dome' }
		];
		expect([...usedIds('referenceKind', { reference: [{ id: 'r1', kind: ' drone SCAN ' }, { id: 'r2', kind: 'hdri360' }] }, kinds)]).toEqual(['k1']);
	});
});
