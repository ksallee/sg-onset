// How Settings is grouped and ordered, and which rows show. Pure.
//
// Two groups. What a wrangler changes on set comes first, most often changed first: the holding
// hand, the button size, the appearance, red night mode, motion, lengths. Then what belongs to
// the device: the project, Flow PT, the safety of the data, its snapshots, backup, storage, about. Side by side on an iPad, the on-set
// group sits on the side of the holding hand, under its thumb.

import { formatDate, today } from '$lib/app/format';
import type { AuthStatus } from '$lib/auth/state';

export const ON_SET = ['hand', 'buttonSize', 'appearance', 'night', 'motion', 'units'] as const;
export const DEVICE_GROUPS = ['project', 'flowpt', 'safety', 'snapshots', 'backup', 'storage', 'about'] as const;

/** The sample project's row: delete it when the device holds it, else no row. It is loaded on the first run. */
export function sampleAction(held: boolean): 'delete' | 'none' {
	return held ? 'delete' : 'none';
}

/**
 * How the sample project is deleted. With another project on the device it goes at once and
 * the notice offers Undo. As the only project its going sends the app back to the first run,
 * where no notice shows: so the person is asked first.
 */
export function sampleRemoval(projects: number): 'undo' | 'confirm' {
	return projects > 1 ? 'undo' : 'confirm';
}

/**
 * The version as About shows it: the release, then the day it was built. SvelteKit names a build
 * by its time in ms; a build named otherwise (a commit) shows its first seven characters.
 */
export function versionLabel(release: string, build: string): string {
	if (build === '') return release;
	if (/^\d{12,14}$/.test(build)) return `${release} · ${formatDate(today(new Date(Number(build)))).replace(/^\S+ /, '')}`;
	return `${release} · ${build.slice(0, 7)}`;
}

/** The rows of the Flow PT section: who is signed in or a way to sign in, then the sync detail. */
export function accountRows(status: AuthStatus): readonly ['account' | 'signIn' | 'signInAgain', 'sync'] {
	return [status === 'signed-in' ? 'account' : status === 'expired' ? 'signInAgain' : 'signIn', 'sync'];
}
