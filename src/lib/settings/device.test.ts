import { describe, expect, it } from 'vitest';
import { EMPTY_DEVICE, parseDevice, serializeDevice } from './device';

describe('device notes', () => {
	it('start empty', () => {
		expect(parseDevice(null)).toEqual(EMPTY_DEVICE);
		expect(EMPTY_DEVICE).toEqual({ installDismissed: false, prototypeDismissed: false });
	});
	it('survive a round trip', () => {
		const notes = { installDismissed: true, prototypeDismissed: true, lastSite: 'studio.shotgrid.autodesk.com', lastBackupAt: 1_794_000_000_000 };
		expect(parseDevice(serializeDevice(notes))).toEqual(notes);
	});
	it('drop what is unreadable', () => {
		for (const raw of ['', 'x', '[]', '7', 'null']) expect(parseDevice(raw)).toEqual(EMPTY_DEVICE);
		expect(parseDevice('{"installDismissed":"yes","lastSite":5,"lastBackupAt":"now"}')).toEqual(EMPTY_DEVICE);
		expect(parseDevice('{"lastBackupAt":-4}')).toEqual(EMPTY_DEVICE);
		expect(parseDevice('{"lastSite":"  "}')).toEqual(EMPTY_DEVICE);
	});
});
