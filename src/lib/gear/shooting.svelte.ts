// The camera setups this device shoots with (shooting.ts), kept in localStorage. Read
// `shooting.value` anywhere; it is a rune. Never synced: each device of a show chooses its own.
import { leaveOff, parseShooting, serializeShooting, setShooting, SHOOTING_KEY, type Shooting } from './shooting';

function load(): Shooting {
	try {
		return parseShooting(localStorage.getItem(SHOOTING_KEY));
	} catch {
		return {};
	}
}

class ShootingChoice {
	#value = $state.raw<Shooting>(typeof localStorage === 'undefined' ? {} : load());

	get value(): Shooting {
		return this.#value;
	}

	/** This device shoots with the setup, or not. */
	set(projectId: string, setupId: string, on: boolean): void {
		this.#save(setShooting(this.#value, projectId, setupId, on));
	}

	/** Setups read back from another device: they start unchosen here. */
	leaveOff(projectId: string, setupIds: readonly string[]): void {
		this.#save(leaveOff(this.#value, projectId, setupIds));
	}

	#save(next: Shooting): void {
		if (next === this.#value) return;
		this.#value = next;
		try {
			localStorage.setItem(SHOOTING_KEY, serializeShooting(next));
		} catch {
			// Blocked storage: it holds for this visit.
		}
	}
}

export const shooting = new ShootingChoice();
