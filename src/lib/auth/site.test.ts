import { describe, expect, it } from 'vitest';
import { checkSite, DEFAULT_HOST_PATTERNS, hostAllowed, normalizeSite, parseHostPatterns } from './site';

const ok = (host: string) => ({ ok: true, host, origin: `https://${host}` });
const no = (reason: string) => ({ ok: false, reason });

describe('normalizeSite', () => {
	it('takes a bare host, as a person types it', () => {
		expect(normalizeSite('studio.shotgrid.autodesk.com')).toEqual(ok('studio.shotgrid.autodesk.com'));
	});

	it('takes an https url, a trailing slash, spaces around and capitals', () => {
		expect(normalizeSite('https://studio.shotgrid.autodesk.com')).toEqual(ok('studio.shotgrid.autodesk.com'));
		expect(normalizeSite('https://studio.shotgrid.autodesk.com/')).toEqual(ok('studio.shotgrid.autodesk.com'));
		expect(normalizeSite('  Studio.ShotGrid.Autodesk.com  ')).toEqual(ok('studio.shotgrid.autodesk.com'));
		expect(normalizeSite('HTTPS://studio.shotgunstudio.com')).toEqual(ok('studio.shotgunstudio.com'));
	});

	it('refuses nothing typed', () => {
		expect(normalizeSite('')).toEqual(no('empty'));
		expect(normalizeSite('   ')).toEqual(no('empty'));
	});

	it('refuses every scheme but https', () => {
		for (const input of [
			'http://studio.shotgrid.autodesk.com',
			'ftp://studio.shotgrid.autodesk.com',
			'ws://studio.shotgrid.autodesk.com',
			'file:///etc/passwd',
			'javascript:alert(1)',
			'data:text/html,hi',
			'//studio.shotgrid.autodesk.com',
			'https:studio.shotgrid.autodesk.com',
			'https:/studio.shotgrid.autodesk.com'
		]) {
			expect(normalizeSite(input), input).toEqual(no('not-https'));
		}
	});

	it('refuses a port, the default one too', () => {
		expect(normalizeSite('studio.shotgrid.autodesk.com:8443')).toEqual(no('port'));
		expect(normalizeSite('https://studio.shotgrid.autodesk.com:443')).toEqual(no('port'));
		expect(normalizeSite('https://studio.shotgrid.autodesk.com:')).toEqual(no('port'));
	});

	it('refuses userinfo, which can hide the real host', () => {
		expect(normalizeSite('https://user:pw@studio.shotgrid.autodesk.com')).toEqual(no('userinfo'));
		expect(normalizeSite('https://studio.shotgrid.autodesk.com@evil.example')).toEqual(no('userinfo'));
		expect(normalizeSite('@studio.shotgrid.autodesk.com')).toEqual(no('userinfo'));
	});

	it('refuses a path, a query, a fragment and a backslash', () => {
		for (const input of [
			'https://studio.shotgrid.autodesk.com/api/v1',
			'https://studio.shotgrid.autodesk.com//',
			'https://studio.shotgrid.autodesk.com?x=1',
			'https://studio.shotgrid.autodesk.com#top',
			'https://studio.shotgrid.autodesk.com\\@evil.example',
			'studio.shotgrid.autodesk.com/../evil'
		]) {
			expect(normalizeSite(input), input).toEqual(no('path'));
		}
	});

	it('refuses IP addresses in every spelling the URL parser turns into one', () => {
		for (const input of [
			'127.0.0.1',
			'https://169.254.169.254',
			'10.0.0.1',
			'0x7f.0.0.1',
			'0177.0.0.1',
			'a.0x1',
			'2130706433',
			'[::1]',
			'https://[::ffff:127.0.0.1]',
			'https://[fd00::1]'
		]) {
			expect(normalizeSite(input), input).toEqual(no('ip'));
		}
	});

	it('refuses local names', () => {
		for (const input of ['localhost', 'https://LOCALHOST', 'app.localhost', 'nas.local', 'metadata.google.internal', '1.0.0.127.in-addr.arpa']) {
			expect(normalizeSite(input), input).toEqual(no('local'));
		}
	});

	it('refuses punycode and anything outside ASCII, so a look-alike cannot pass', () => {
		expect(normalizeSite('xn--studio-9za.shotgrid.autodesk.com')).toEqual(no('punycode'));
		expect(normalizeSite('studio.xn--shotgrd-l6a.autodesk.com')).toEqual(no('punycode'));
		// Cyrillic "о" in "studio".
		expect(normalizeSite('studiо.shotgrid.autodesk.com')).toEqual(no('not-ascii'));
		// Fullwidth dot, which the URL parser maps to "." .
		expect(normalizeSite('studio．shotgrid.autodesk.com')).toEqual(no('not-ascii'));
		// A zero-width space.
		expect(normalizeSite('stu​dio.shotgrid.autodesk.com')).toEqual(no('not-ascii'));
	});

	it('refuses hosts that are not plain DNS names', () => {
		for (const input of [
			'studio',
			'studio.shotgrid.autodesk.com.',
			'.studio.shotgrid.autodesk.com',
			'studio..autodesk.com',
			'-studio.shotgrid.autodesk.com',
			'studio-.shotgrid.autodesk.com',
			'stu_dio.shotgrid.autodesk.com',
			'stu%64io.shotgrid.autodesk.com',
			'stu dio.shotgrid.autodesk.com',
			'studio.shot\tgrid.autodesk.com',
			'studio\n.shotgrid.autodesk.com',
			`${'a'.repeat(64)}.shotgrid.autodesk.com`,
			`${'a.'.repeat(130)}com`
		]) {
			expect(normalizeSite(input), JSON.stringify(input)).toEqual(no('invalid'));
		}
	});
});

describe('parseHostPatterns', () => {
	it('reads a comma or space separated list, lower-cased', () => {
		expect(parseHostPatterns('fpt.studio.example, *.Tracking.Example\n other.example')).toEqual({
			patterns: ['fpt.studio.example', '*.tracking.example', 'other.example'],
			rejected: []
		});
	});

	it('reads nothing as no patterns', () => {
		expect(parseHostPatterns(undefined)).toEqual({ patterns: [], rejected: [] });
		expect(parseHostPatterns('  ,, ')).toEqual({ patterns: [], rejected: [] });
	});

	it('refuses entries that would open the proxy wide or reach inside', () => {
		const { patterns, rejected } = parseHostPatterns(
			'*, *.com, *.*.example, a.*.example, 127.0.0.1, localhost, *.local, https://fpt.example, fpt.example:443, xn--fpt-9za.example, fpt.example/path, ok.example'
		);
		expect(patterns).toEqual(['ok.example']);
		expect(rejected).toEqual([
			'*',
			'*.com',
			'*.*.example',
			'a.*.example',
			'127.0.0.1',
			'localhost',
			'*.local',
			'https://fpt.example',
			'fpt.example:443',
			'xn--fpt-9za.example',
			'fpt.example/path'
		]);
	});
});

describe('hostAllowed', () => {
	it('matches one label under a wildcard, never the bare domain or two labels', () => {
		const p = ['*.shotgrid.autodesk.com'];
		expect(hostAllowed('studio.shotgrid.autodesk.com', p)).toBe(true);
		expect(hostAllowed('shotgrid.autodesk.com', p)).toBe(false);
		expect(hostAllowed('a.b.shotgrid.autodesk.com', p)).toBe(false);
		expect(hostAllowed('studio.shotgrid.autodesk.com.evil.example', p)).toBe(false);
		expect(hostAllowed('evilshotgrid.autodesk.com', p)).toBe(false);
		expect(hostAllowed('studio-shotgrid.autodesk.com', p)).toBe(false);
	});

	it('matches an exact host exactly', () => {
		expect(hostAllowed('fpt.studio.example', ['fpt.studio.example'])).toBe(true);
		expect(hostAllowed('x.fpt.studio.example', ['fpt.studio.example'])).toBe(false);
		expect(hostAllowed('studio.example', ['fpt.studio.example'])).toBe(false);
	});
});

describe('checkSite', () => {
	it('allows the Autodesk-hosted domains by default', () => {
		expect(DEFAULT_HOST_PATTERNS).toEqual(['*.shotgrid.autodesk.com', '*.shotgunstudio.com']);
		expect(checkSite('studio.shotgrid.autodesk.com')).toEqual(ok('studio.shotgrid.autodesk.com'));
		expect(checkSite('https://studio.shotgunstudio.com/')).toEqual(ok('studio.shotgunstudio.com'));
	});

	it('refuses any other host unless the deploy names it', () => {
		expect(checkSite('fpt.studio.example')).toEqual(no('not-allowed'));
		expect(checkSite('autodesk.com')).toEqual(no('not-allowed'));
		expect(checkSite('fpt.studio.example', 'fpt.studio.example')).toEqual(ok('fpt.studio.example'));
		// The defaults stay when the deploy adds hosts.
		expect(checkSite('studio.shotgrid.autodesk.com', 'fpt.studio.example')).toEqual(ok('studio.shotgrid.autodesk.com'));
	});

	it('reports a malformed site before the allowlist', () => {
		expect(checkSite('http://studio.shotgrid.autodesk.com')).toEqual(no('not-https'));
		expect(checkSite('127.0.0.1', '127.0.0.1')).toEqual(no('ip'));
		expect(checkSite('localhost', 'localhost')).toEqual(no('local'));
	});
});
