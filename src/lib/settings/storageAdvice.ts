// What the Storage section of Settings says: whether the data on this device is safe from the
// browser's cleanup, in plain words, and the one thing to do about it. Pure.
//
// Safari clears what a site stored when the site was not opened for seven days, unless the app
// is on the Home Screen or the browser granted persistent storage ($lib/pwa/persist). Any
// browser may clear a site that was not granted it when the device runs low on space.

import { formatBytes } from '$lib/app/format';
import type { InstallHint } from '$lib/pwa/platform';
import type { StorageStatus } from '$lib/store/types';

export interface StorageFacts {
	/** The browser has a storage API at all (`navigator.storage`). */
	supported: boolean;
	/** What the store read; undefined until it has answered. */
	status: StorageStatus | undefined;
	/** Running from the Home Screen. */
	standalone: boolean;
	/** How this browser installs the app ($lib/pwa/platform). */
	hint: InstallHint;
	/** The person asked the browser to protect the data and it said no. */
	refused: boolean;
}

export interface StorageAdvice {
	/**
	 * - `protected`: the browser promised to keep the data.
	 * - `installed`: on the Home Screen, so the 7-day cleanup does not apply; no promise beyond.
	 * - `at-risk`: the browser may clear the data.
	 * - `unknown`: the browser does not say.
	 */
	level: 'protected' | 'installed' | 'at-risk' | 'unknown';
	/** The one-word answer, a message key. */
	state: `settings.storage.state.${'protected' | 'installed' | 'atRisk' | 'unknown'}`;
	/** What it means and what to do, a message key. */
	body: `settings.storage.body.${'protected' | 'installed' | 'installedRefused' | 'safariTab' | 'inApp' | 'browser' | 'refused' | 'unknown'}`;
	/** `ask`: ask the browser. `install`: add to the Home Screen. `open-in-safari`: this browser cannot install. */
	action: 'ask' | 'install' | 'open-in-safari' | 'none';
	/** "12.4 MB", when the browser says. */
	used: string | undefined;
	/** "2 GB", when the browser says. */
	free: string | undefined;
	/** Less than a tenth of the space is left. */
	low: boolean;
}

const LOW_FRACTION = 0.9;

export function storageAdvice(facts: StorageFacts): StorageAdvice | undefined {
	const { status } = facts;
	if (!status) return undefined;
	const sizes = {
		used: status.usage === undefined ? undefined : formatBytes(status.usage),
		free: status.free === undefined ? undefined : formatBytes(status.free),
		low: (status.usedFraction ?? 0) >= LOW_FRACTION
	};
	if (status.persisted) return { level: 'protected', state: 'settings.storage.state.protected', body: 'settings.storage.body.protected', action: 'none', ...sizes };
	if (!facts.supported) return { level: 'unknown', state: 'settings.storage.state.unknown', body: 'settings.storage.body.unknown', action: 'none', ...sizes };
	if (facts.standalone) {
		return { level: 'installed', state: 'settings.storage.state.installed', body: facts.refused ? 'settings.storage.body.installedRefused' : 'settings.storage.body.installed', action: 'ask', ...sizes };
	}
	const atRisk = { level: 'at-risk', state: 'settings.storage.state.atRisk' } as const;
	if (facts.hint === 'ios-share') return { ...atRisk, body: 'settings.storage.body.safariTab', action: 'install', ...sizes };
	if (facts.hint === 'ios-open-in-safari') return { ...atRisk, body: 'settings.storage.body.inApp', action: 'open-in-safari', ...sizes };
	return { ...atRisk, body: facts.refused ? 'settings.storage.body.refused' : 'settings.storage.body.browser', action: 'ask', ...sizes };
}
