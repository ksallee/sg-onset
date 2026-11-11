// Facts about this device that are not preferences: the Home Screen guidance and the early
// prototype notice were dismissed, the
// last site typed at sign-in, when a backup last left the device. Kept apart from the settings
// (lib/app/settings.ts), which hold what the person chose. Pure; `device.svelte.ts` stores them.

export const DEVICE_KEY = 'sg-onset.device';

export interface DeviceNotes {
	/** The person closed the Add to Home Screen guidance: never shown again on the first run. */
	installDismissed: boolean;
	/** The person closed the early prototype notice on the first run. About keeps it. */
	prototypeDismissed: boolean;
	/** The host last typed at sign-in, signed in or not. */
	lastSite?: string;
	/** When a backup was last shared or saved, ms. */
	lastBackupAt?: number;
}

export const EMPTY_DEVICE: DeviceNotes = { installDismissed: false, prototypeDismissed: false };

/** What was stored, with anything unreadable left out. */
export function parseDevice(raw: string | null | undefined): DeviceNotes {
	let value: unknown;
	try {
		value = raw ? JSON.parse(raw) : null;
	} catch {
		value = null;
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return EMPTY_DEVICE;
	const v = value as Record<string, unknown>;
	const notes: DeviceNotes = { installDismissed: v.installDismissed === true, prototypeDismissed: v.prototypeDismissed === true };
	if (typeof v.lastSite === 'string' && v.lastSite.trim() !== '') notes.lastSite = v.lastSite.trim();
	if (typeof v.lastBackupAt === 'number' && Number.isFinite(v.lastBackupAt) && v.lastBackupAt > 0) notes.lastBackupAt = v.lastBackupAt;
	return notes;
}

export function serializeDevice(notes: DeviceNotes): string {
	return JSON.stringify(notes);
}
