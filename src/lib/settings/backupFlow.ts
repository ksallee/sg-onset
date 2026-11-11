// The Backup section of Settings as a state machine: making the zip and handing it over, and
// restoring from one. A restore checks the whole file first; a device that holds data is asked
// before anything is replaced. One thing runs at a time, and a second tap changes nothing. Pure;
// `backupDriver.svelte.ts` does the work.

import type { BackupRefusal } from '$lib/store/backup';

export type Refusal = Exclude<BackupRefusal, 'notEmpty'> | 'other';
export interface PickedFile {
	name: string;
	size: number;
}

export type RestoreState =
	| { step: 'idle' }
	/** The file is being read and checked. Nothing on the device has changed. */
	| { step: 'checking'; file: PickedFile }
	/** The file is good and the device holds data: the person is asked. */
	| { step: 'confirm'; file: PickedFile }
	/** No snapshot of the device could be taken first: the person is asked again, since the replace cannot be undone. */
	| { step: 'unprotected'; file: PickedFile }
	| { step: 'replacing'; file: PickedFile }
	| { step: 'refused'; reason: Refusal; file: PickedFile }
	| { step: 'done'; records: number; files: number };

export interface BackupState {
	export: 'idle' | 'working' | 'ready' | 'failed';
	restore: RestoreState;
}

export type BackupEvent =
	| { type: 'export' }
	| { type: 'exported' }
	| { type: 'exportFailed' }
	/** The file was shared or saved. */
	| { type: 'handed' }
	/** The share sheet was closed with nothing done. */
	| { type: 'handCancelled' }
	| { type: 'picked'; file: PickedFile }
	| { type: 'refused'; reason: Refusal | 'notEmpty' }
	/** The snapshot before the replace failed. */
	| { type: 'noSnapshot' }
	| { type: 'confirm' }
	| { type: 'cancel' }
	| { type: 'restored'; records: number; files: number };

export const IDLE: BackupState = { export: 'idle', restore: { step: 'idle' } };

/** A file is being made, checked or restored: no other work starts. */
export function busy(state: BackupState): boolean {
	return state.export === 'working' || state.restore.step === 'checking' || state.restore.step === 'replacing';
}

export function backupFlow(state: BackupState, event: BackupEvent): BackupState {
	const restore = state.restore;
	const asking = restore.step === 'confirm' || restore.step === 'unprotected';
	switch (event.type) {
		case 'export':
			return busy(state) || asking ? state : { ...state, export: 'working' };
		case 'exported':
			return state.export === 'working' ? { ...state, export: 'ready' } : state;
		case 'exportFailed':
			return state.export === 'working' ? { ...state, export: 'failed' } : state;
		case 'handed':
			return state.export === 'ready' ? { ...state, export: 'idle' } : state;
		case 'handCancelled':
			return state;
		case 'picked':
			return busy(state) || asking ? state : { ...state, restore: { step: 'checking', file: event.file } };
		case 'refused':
			if (restore.step !== 'checking' && restore.step !== 'replacing') return state;
			if (event.reason === 'notEmpty') return restore.step === 'checking' ? { ...state, restore: { step: 'confirm', file: restore.file } } : { ...state, restore: { step: 'refused', reason: 'other', file: restore.file } };
			return { ...state, restore: { step: 'refused', reason: event.reason, file: restore.file } };
		case 'noSnapshot':
			return restore.step === 'replacing' ? { ...state, restore: { step: 'unprotected', file: restore.file } } : state;
		case 'confirm':
			return restore.step === 'confirm' || restore.step === 'unprotected' ? { ...state, restore: { step: 'replacing', file: restore.file } } : state;
		case 'cancel':
			return asking ? { ...state, restore: { step: 'idle' } } : state;
		case 'restored':
			return restore.step === 'checking' || restore.step === 'replacing' ? { ...state, restore: { step: 'done', records: event.records, files: event.files } } : state;
	}
}
