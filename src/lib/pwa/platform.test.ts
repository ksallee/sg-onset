import { describe, expect, it } from 'vitest';
import { installHint, isStandalone } from './platform';

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 389.0.0.0 (iPhone15,2; iOS 18_5; en_US)';
const IPHONE_FACEBOOK =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/500.0]';
const IPAD_DESKTOP_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
const MAC_CHROME =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

describe('isStandalone', () => {
	it('is true when the display-mode query matches', () => {
		expect(isStandalone({ displayMode: true })).toBe(true);
	});
	it('is true on iOS home-screen apps (navigator.standalone)', () => {
		expect(isStandalone({ displayMode: false, navigatorStandalone: true })).toBe(true);
	});
	it('is false in a browser tab', () => {
		expect(isStandalone({ displayMode: false })).toBe(false);
		expect(isStandalone({ displayMode: false, navigatorStandalone: false })).toBe(false);
	});
});

describe('installHint', () => {
	it('says nothing once installed', () => {
		expect(installHint(IPHONE_SAFARI, true)).toBe('none');
		expect(installHint(ANDROID_CHROME, true)).toBe('none');
	});
	it('tells iOS Safari to use Share → Add to Home Screen', () => {
		expect(installHint(IPHONE_SAFARI, false)).toBe('ios-share');
	});
	it('tells other iOS browsers the same (they can add to the home screen since iOS 16.4)', () => {
		expect(installHint(IPHONE_CHROME, false)).toBe('ios-share');
	});
	it('tells in-app browsers to open the page in Safari', () => {
		expect(installHint(IPHONE_INSTAGRAM, false)).toBe('ios-open-in-safari');
		expect(installHint(IPHONE_FACEBOOK, false)).toBe('ios-open-in-safari');
	});
	it('spots an iPad that sends a Mac user agent by its touch points', () => {
		expect(installHint(IPAD_DESKTOP_UA, false, 5)).toBe('ios-share');
		expect(installHint(IPAD_DESKTOP_UA, false, 0)).toBe('browser');
	});
	it('leaves other platforms to the browser install prompt or menu', () => {
		expect(installHint(ANDROID_CHROME, false)).toBe('browser');
		expect(installHint(MAC_CHROME, false)).toBe('browser');
	});
});
