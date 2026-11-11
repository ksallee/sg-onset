import { describe, expect, it } from 'vitest';
import { readSite, tidySite } from './siteInput';

const HOST = 'studio.shotgrid.autodesk.com';

describe('tidySite', () => {
	it.each([
		['studio.shotgrid.autodesk.com', HOST],
		['https://studio.shotgrid.autodesk.com', HOST],
		['https://studio.shotgrid.autodesk.com/', HOST],
		['https://studio.shotgrid.autodesk.com/page/1234?layout=x#Shot_12', HOST],
		['  studio.shotgrid.autodesk.com  ', HOST],
		['studio .shotgrid. autodesk.com', HOST],
		[' studio.shotgrid.autodesk.com​', HOST],
		['STUDIO.ShotGrid.Autodesk.com', HOST],
		['HTTPS://Studio.shotgrid.autodesk.com/Detail/Shot/1', HOST],
		['http://studio.shotgrid.autodesk.com', HOST],
		['studio.shotgrid.autodesk.com:443', HOST],
		['studio.shotgrid.autodesk.com.', HOST],
		['<https://studio.shotgrid.autodesk.com/>', HOST],
		['"studio.shotgrid.autodesk.com"', HOST],
		['studio', HOST],
		['My-Studio', 'my-studio.shotgrid.autodesk.com']
	])('reads %j as %s', (typed, host) => {
		expect(tidySite(typed)).toBe(host);
	});

	it('leaves what is not safe to fix, so the reason can be said', () => {
		expect(tidySite('studio.shotgrid.autodesk.com:8080')).toBe('studio.shotgrid.autodesk.com:8080');
		expect(tidySite('me:pw@studio.shotgrid.autodesk.com')).toBe('me:pw@studio.shotgrid.autodesk.com');
		expect(tidySite('ftp://studio.shotgrid.autodesk.com')).toBe('ftp://studio.shotgrid.autodesk.com');
		expect(tidySite('')).toBe('');
		expect(tidySite('   ')).toBe('');
	});
});

describe('readSite', () => {
	it('is empty for nothing typed', () => {
		expect(readSite(' ')).toEqual({ kind: 'empty' });
	});
	it('gives the host and the origin of a site', () => {
		expect(readSite(' HTTPS://Studio.shotgrid.autodesk.com/page/1 ')).toEqual({ kind: 'ok', host: HOST, origin: `https://${HOST}`, completed: false });
	});
	it('says when it filled in the hosted domain', () => {
		expect(readSite('studio')).toEqual({ kind: 'ok', host: HOST, origin: `https://${HOST}`, completed: true });
	});
	it.each([
		['studio.shotgrid.autodesk.com:8080', 'port'],
		['me@studio.shotgrid.autodesk.com', 'userinfo'],
		['ftp://studio.shotgrid.autodesk.com', 'not-https'],
		['192.168.1.10', 'ip'],
		['localhost.', 'local'],
		['studio.local', 'local'],
		['stüdio.shotgrid.autodesk.com', 'not-ascii'],
		['xn--stdio-kva.shotgrid.autodesk.com', 'punycode'],
		['studio..shotgrid.autodesk.com', 'invalid'],
		['stu_dio.shotgrid.autodesk.com', 'invalid']
	])('refuses %j: %s', (typed, reason) => {
		expect(readSite(typed)).toEqual({ kind: 'problem', reason });
	});
});
