// The settings in the browser: kept in localStorage, applied to <html> and to the theme-color
// meta. On <html>: `data-theme="light|dark"` (resolved), `data-night="true"` in red night mode,
// (the two are the theme: lib/theme/tokens.css keys on them), `data-hand="left|right"`,
// `data-motion="full|reduced"` (resolved), `data-button-size="standard|large"`, `--target`,
// `--gap`, `--touch`. app.html's inline script does the theme, the hand and the motion before the
// first paint; `start()` (root layout) does the rest and follows another tab. Read
// `settings.value` anywhere; it is a rune.
import { DEFAULT_SETTINGS, SETTINGS_KEY, documentLook, parseSettings, serializeSettings, withLast, type DocumentLook, type Last, type Settings } from './settings';

const query = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const reducedQuery = () => query('(prefers-reduced-motion: reduce)');
const darkQuery = () => query('(prefers-color-scheme: dark)');

function load(): Settings {
	try {
		return parseSettings(localStorage.getItem(SETTINGS_KEY));
	} catch {
		return DEFAULT_SETTINGS;
	}
}

class AppSettings {
	#value = $state.raw<Settings>(typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : load());

	get value(): Settings {
		return this.#value;
	}

	/** Changes some settings, saves and applies them. */
	update(patch: Partial<Settings>): void {
		this.#set({ ...this.#value, ...patch });
	}

	/** Remembers where the person is: a project, a shoot day, a slate (see `withLast`). */
	place(last: Last): void {
		this.#set(withLast(this.#value, last));
	}

	#set(next: Settings): void {
		this.#value = next;
		try {
			localStorage.setItem(SETTINGS_KEY, serializeSettings(next));
		} catch {
			// Blocked storage: it holds for this visit.
		}
		this.apply();
	}

	/** Applies the settings and follows changes made in another tab. Returns the stop. */
	start(): () => void {
		this.apply();
		const changed = (event: StorageEvent) => {
			if (event.key !== SETTINGS_KEY) return;
			this.#value = parseSettings(event.newValue);
			this.apply();
		};
		window.addEventListener('storage', changed);
		// On System, the appearance and the motion follow the device when it changes its mind.
		const queries = [reducedQuery(), darkQuery()];
		const asked = () => this.apply();
		for (const q of queries) q?.addEventListener('change', asked);
		return () => {
			window.removeEventListener('storage', changed);
			for (const q of queries) q?.removeEventListener('change', asked);
		};
	}

	/** The look in force: the settings and what the device asks for. */
	look(): DocumentLook {
		return documentLook(this.#value, { dark: darkQuery()?.matches ?? true, reducedMotion: reducedQuery()?.matches ?? false });
	}

	apply(): void {
		if (typeof document === 'undefined') return;
		const look = this.look();
		const root = document.documentElement;
		root.dataset.theme = look.theme;
		if (look.night) root.dataset.night = 'true';
		else delete root.dataset.night;
		root.dataset.hand = look.hand;
		root.dataset.motion = look.motion;
		root.dataset.buttonSize = look.buttonSize;
		root.style.setProperty('--target', `${look.target}px`);
		root.style.setProperty('--gap', `${look.gap}px`);
		root.style.setProperty('--touch', `${look.touch}px`);
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look.themeColor);
	}
}

export const settings = new AppSettings();
