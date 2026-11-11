// The appearance setting in the browser: stored in localStorage, applied as `data-theme` on
// <html> (app.css reads it) and as the theme-color meta. app.html's inline script does the same
// before the first paint; `start()` (root layout) follows the system while the choice is System.
import { APPEARANCE_KEY, THEME_COLOR, parseAppearance, resolveAppearance, type Appearance } from './appearance';

const query = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

class AppearanceSetting {
	choice = $state<Appearance>('system');

	/** Reads the stored choice, applies it, and follows the system from then on. Returns the stop. */
	start(): () => void {
		try {
			this.choice = parseAppearance(localStorage.getItem(APPEARANCE_KEY));
		} catch {
			this.choice = 'system';
		}
		this.apply();
		const q = query();
		const changed = () => this.apply();
		q?.addEventListener('change', changed);
		return () => q?.removeEventListener('change', changed);
	}

	set(choice: Appearance) {
		this.choice = choice;
		try {
			if (choice === 'system') localStorage.removeItem(APPEARANCE_KEY);
			else localStorage.setItem(APPEARANCE_KEY, choice);
		} catch {
			// Private mode: it holds for this visit.
		}
		this.apply();
	}

	apply() {
		const theme = resolveAppearance(this.choice, query()?.matches ?? true);
		document.documentElement.dataset.theme = theme;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
	}
}

export const appearance = new AppearanceSetting();
