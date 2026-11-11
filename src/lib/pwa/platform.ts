// Is the app running from the home screen, and if not, how would this browser install it.
// Pure: the browser's answers come in as arguments; `readStandalone` and `readInstallHint` are
// the thin readers for components.

export type StandaloneSignals = {
	/** `matchMedia('(display-mode: standalone)').matches` */
	displayMode: boolean;
	/** iOS Safari's own `navigator.standalone`, true when launched from the home screen. */
	navigatorStandalone?: boolean;
};

/**
 * What to tell someone who has not installed the app.
 * - `none`: installed already, say nothing.
 * - `ios-share`: iOS / iPadOS: Share, then Add to Home Screen (no install prompt on iOS).
 * - `ios-open-in-safari`: an in-app browser (Instagram, Facebook…) cannot install: open in Safari.
 * - `browser`: elsewhere the browser offers it (`beforeinstallprompt` or its menu).
 */
export type InstallHint = 'none' | 'ios-share' | 'ios-open-in-safari' | 'browser';

export function isStandalone(s: StandaloneSignals): boolean {
	return s.displayMode || s.navigatorStandalone === true;
}

const IN_APP = /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|GSA\//;

/** `touchPoints` (`navigator.maxTouchPoints`) tells an iPad, which sends a Mac user agent. */
export function installHint(ua: string, standalone: boolean, touchPoints = 0): InstallHint {
	if (standalone) return 'none';
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
	if (!ios) return 'browser';
	return IN_APP.test(ua) ? 'ios-open-in-safari' : 'ios-share';
}

/** The page's own answer; false outside a browser. */
export function readStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return isStandalone({
		displayMode: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
		navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone
	});
}

/** The hint for this browser; `none` outside one. */
export function readInstallHint(): InstallHint {
	if (typeof navigator === 'undefined') return 'none';
	return installHint(navigator.userAgent, readStandalone(), navigator.maxTouchPoints ?? 0);
}
