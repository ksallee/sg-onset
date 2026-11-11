import { describe, expect, it } from 'vitest';
import { backupFlow, busy, IDLE } from './backupFlow';

const file = { name: 'sg-onset-2026-11-11-1530.zip', size: 1234 };

describe('export', () => {
	it('makes the file, offers it, and is done once it is handed over', () => {
		let s = backupFlow(IDLE, { type: 'export' });
		expect(s.export).toBe('working');
		s = backupFlow(s, { type: 'exported' });
		expect(s.export).toBe('ready');
		s = backupFlow(s, { type: 'handed' });
		expect(s.export).toBe('idle');
	});
	it('takes one tap while it works', () => {
		const working = backupFlow(IDLE, { type: 'export' });
		expect(backupFlow(working, { type: 'export' })).toBe(working);
	});
	it('says when it failed and lets the person try again', () => {
		const failed = backupFlow(backupFlow(IDLE, { type: 'export' }), { type: 'exportFailed' });
		expect(failed.export).toBe('failed');
		expect(backupFlow(failed, { type: 'export' }).export).toBe('working');
	});
	it('keeps the file on offer when the share sheet is closed', () => {
		const ready = backupFlow(backupFlow(IDLE, { type: 'export' }), { type: 'exported' });
		expect(backupFlow(ready, { type: 'handCancelled' })).toBe(ready);
	});
});

describe('restore', () => {
	const checking = backupFlow(IDLE, { type: 'picked', file });

	it('checks the file before anything is asked', () => {
		expect(checking.restore).toEqual({ step: 'checking', file });
	});
	it('restores at once on an empty device', () => {
		const s = backupFlow(checking, { type: 'restored', records: 12, files: 3 });
		expect(s.restore).toEqual({ step: 'done', records: 12, files: 3 });
	});
	it('asks before it replaces what the device holds', () => {
		const ask = backupFlow(checking, { type: 'refused', reason: 'notEmpty' });
		expect(ask.restore).toEqual({ step: 'confirm', file });
		const go = backupFlow(ask, { type: 'confirm' });
		expect(go.restore).toEqual({ step: 'replacing', file });
		expect(backupFlow(ask, { type: 'cancel' }).restore).toEqual({ step: 'idle' });
	});
	it.each(['notBackup', 'corrupt', 'incomplete', 'newerFormat', 'newerSchema', 'olderSchema', 'other'] as const)('says why a %s file was refused and replaces nothing', (reason) => {
		expect(backupFlow(checking, { type: 'refused', reason }).restore).toEqual({ step: 'refused', reason, file });
	});
	it('says why when the replace itself fails', () => {
		const replacing = backupFlow(backupFlow(checking, { type: 'refused', reason: 'notEmpty' }), { type: 'confirm' });
		expect(backupFlow(replacing, { type: 'refused', reason: 'other' }).restore).toEqual({ step: 'refused', reason: 'other', file });
	});
	it('takes one file at a time, and one confirm', () => {
		expect(backupFlow(checking, { type: 'picked', file: { name: 'b.zip', size: 1 } })).toBe(checking);
		const replacing = backupFlow(backupFlow(checking, { type: 'refused', reason: 'notEmpty' }), { type: 'confirm' });
		expect(backupFlow(replacing, { type: 'confirm' })).toBe(replacing);
		expect(backupFlow(replacing, { type: 'cancel' })).toBe(replacing);
		expect(backupFlow(replacing, { type: 'picked', file })).toBe(replacing);
	});
	it('picks again after a refusal', () => {
		const refused = backupFlow(checking, { type: 'refused', reason: 'corrupt' });
		expect(backupFlow(refused, { type: 'picked', file }).restore).toEqual({ step: 'checking', file });
	});
	it('does not export while it restores, nor restore while it exports', () => {
		expect(backupFlow(checking, { type: 'export' })).toBe(checking);
		const exporting = backupFlow(IDLE, { type: 'export' });
		expect(backupFlow(exporting, { type: 'picked', file })).toBe(exporting);
	});
	it('asks once more when no snapshot could be taken first: then the replace cannot be undone', () => {
		const replacing = backupFlow(backupFlow(checking, { type: 'refused', reason: 'notEmpty' }), { type: 'confirm' });
		const ask = backupFlow(replacing, { type: 'noSnapshot' });
		expect(ask.restore).toEqual({ step: 'unprotected', file });
		expect(backupFlow(ask, { type: 'cancel' }).restore).toEqual({ step: 'idle' });
		expect(backupFlow(ask, { type: 'confirm' }).restore).toEqual({ step: 'replacing', file });
		expect(backupFlow(ask, { type: 'picked', file })).toBe(ask);
		expect(backupFlow(ask, { type: 'export' })).toBe(ask);
		expect(backupFlow(checking, { type: 'noSnapshot' })).toBe(checking);
	});
});

describe('busy', () => {
	it('is true while a file is made, checked or restored', () => {
		expect(busy(IDLE)).toBe(false);
		expect(busy(backupFlow(IDLE, { type: 'export' }))).toBe(true);
		expect(busy(backupFlow(IDLE, { type: 'picked', file }))).toBe(true);
		expect(busy(backupFlow(backupFlow(IDLE, { type: 'picked', file }), { type: 'refused', reason: 'notEmpty' }))).toBe(false);
	});
});
