// Notes on Shots (#97): the setting, and which Shots a sync writes Notes for. Off by default: some
// studios will not want an app writing Notes. Kept per project on the device, beside the project's
// link (links.ts): it is a choice about what this project writes to its Flow PT project, a device
// may hold projects of two studios, and one device with it on is enough, since the Note is built
// from what Flow PT holds. Not in the store's tables, so not in a backup, as the link is not. Pure.

import type { ShotResult } from '$lib/fpt';

/** The key the setting is kept under, per project. */
export function notesKey(localProjectId: string): string {
	return `notes:${localProjectId}`;
}

const ON = 'on';

/** What is kept for on. Off is nothing kept. */
export function writeNotesOn(): string {
	return ON;
}

/** Whether what was kept says on. Anything else is off. */
export function readNotesOn(raw: string | undefined): boolean {
	return raw === ON;
}

/**
 * What the sync sheet shows: off; on; or on and waiting, while the site lacks the Note fields an
 * admin makes with Set Up Fields.
 */
export function notesView(on: boolean, missing: boolean): 'off' | 'on' | 'setup' {
	if (!on) return 'off';
	return missing ? 'setup' : 'on';
}

/** Every Shot the slates reach through their Set Shots, each once, in order: whose Notes to write. */
export function shotsToNote(results: readonly ShotResult[]): number[] {
	return [...new Set(results.flatMap((r) => r.shots))].sort((a, b) => a - b);
}
