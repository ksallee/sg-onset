// "Keep Screen On": a screen wake lock the person turns on and off. The system drops the lock
// whenever the page is hidden (lock button, app switch); it is taken again when the page shows,
// as long as it is still wanted. iOS Safari 16.4+ and home-screen apps 18.4+ have it.

export class WakeLock {
	/** Wanted: the switch's position. */
	on = $state(false);
	/** Held right now (false while hidden, or where the browser refuses). */
	held = $state(false);
	readonly supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

	#sentinel: WakeLockSentinel | null = null;
	#visible = () => {
		if (document.visibilityState === 'visible' && this.on && !this.#sentinel) void this.#acquire();
	};

	constructor() {
		if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.#visible);
	}

	toggle(): void {
		this.set(!this.on);
	}

	set(on: boolean): void {
		this.on = on;
		if (on) void this.#acquire();
		else void this.#release();
	}

	/** Releases the lock and stops listening: call when the screen goes away. */
	destroy(): void {
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.#visible);
		void this.#release();
	}

	async #acquire(): Promise<void> {
		if (!this.supported || this.#sentinel || document.visibilityState !== 'visible') return;
		try {
			const s = await navigator.wakeLock.request('screen');
			if (!this.on) {
				void s.release();
				return;
			}
			this.#sentinel = s;
			this.held = true;
			s.addEventListener('release', () => {
				if (this.#sentinel === s) this.#sentinel = null;
				this.held = false;
			});
		} catch {
			// Refused (low battery, not allowed): stays wanted, retried on the next show.
			this.held = false;
		}
	}

	async #release(): Promise<void> {
		const s = this.#sentinel;
		this.#sentinel = null;
		this.held = false;
		await s?.release().catch(() => {});
	}
}
