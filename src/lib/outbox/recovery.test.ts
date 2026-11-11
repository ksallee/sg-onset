import { describe, expect, it } from 'vitest';
import { judge } from './recovery';
import { blob, create, del, entry, update } from './testkit';

describe('judge: did an attempt that may have landed land', () => {
	it('a create landed when the client UUID is found', () => {
		const e = entry(create('take', 't1'), { state: 'sentUnconfirmed' });
		expect(judge(e, { found: 41 })).toEqual({ applied: true, remoteId: 41 });
		expect(judge(e, {})).toEqual({ applied: false });
	});

	it('a delete landed when the client UUID is no longer found', () => {
		const e = entry(del('take', 't1'), { state: 'sentUnconfirmed' });
		expect(judge(e, {})).toEqual({ applied: true });
		expect(judge(e, { found: 41 })).toEqual({ applied: false });
	});

	it('an update landed when the server holds every value we sent', () => {
		const e = entry(update('take', 't1', { tStop: [2.8, 4], notes: ['a', undefined] }), { state: 'sentUnconfirmed' });
		expect(judge(e, { server: { tStop: 4 } })).toEqual({ applied: true });
		expect(judge(e, { server: { tStop: 4, notes: 'a' } })).toEqual({ applied: false });
		expect(judge(e, { server: { tStop: 2.8 } })).toEqual({ applied: false });
	});

	it('an update to a record the server does not have did not land', () => {
		const e = entry(update('take', 't1', { tStop: [2.8, 4] }), { state: 'sentUnconfirmed' });
		expect(judge(e, {})).toEqual({ applied: false });
	});

	it('an upload landed only when it is verified', () => {
		const e = entry(blob('p1'), { state: 'sentUnconfirmed', remoteId: 'att-1' });
		expect(judge(e, { verified: true })).toEqual({ applied: true });
		expect(judge(e, { verified: true, remoteId: 'att-2' })).toEqual({ applied: true, remoteId: 'att-2' });
		expect(judge(e, { verified: false })).toEqual({ applied: false });
		expect(judge(e, {})).toEqual({ applied: false });
	});
});
