// The device notes in the browser (device.ts), kept in localStorage. Read `device.value`
// anywhere; it is a rune. Not the settings: nothing here is a choice the person made about how
// the app looks or is held.
import { DEVICE_KEY, EMPTY_DEVICE, parseDevice, serializeDevice, type DeviceNotes } from './device';

function load(): DeviceNotes {
	try {
		return parseDevice(localStorage.getItem(DEVICE_KEY));
	} catch {
		return EMPTY_DEVICE;
	}
}

class Device {
	#value = $state.raw<DeviceNotes>(typeof localStorage === 'undefined' ? EMPTY_DEVICE : load());

	get value(): DeviceNotes {
		return this.#value;
	}

	update(patch: Partial<DeviceNotes>): void {
		this.#value = { ...this.#value, ...patch };
		try {
			localStorage.setItem(DEVICE_KEY, serializeDevice(this.#value));
		} catch {
			// Blocked storage: it holds for this visit.
		}
	}
}

export const device = new Device();
