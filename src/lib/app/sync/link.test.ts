import { describe, expect, it } from 'vitest';
import { memoryKeyValue } from '$lib/fpt/cache';
import { linkKey, linkOn, linkProblem, parseLink, serializeLink, type ProjectLink } from './link';
import { linkStore } from './links';

const SITE = 'https://studio.shotgrid.autodesk.com';
const LINK: ProjectLink = { site: SITE, projectId: 1234, name: 'Big Show' };

describe('the stored link', () => {
	it('round-trips', () => {
		expect(parseLink(serializeLink(LINK))).toEqual(LINK);
	});
	it('reads anything unreadable as no link', () => {
		for (const raw of [undefined, '', 'nope', '{}', JSON.stringify({ v: 2, ...LINK }), JSON.stringify({ v: 1, site: SITE, projectId: '12', name: 'x' }), JSON.stringify({ v: 1, site: SITE, projectId: 0, name: 'x' }), JSON.stringify({ v: 1, site: 'http://x', projectId: 3, name: 'x' })]) {
			expect(parseLink(raw), String(raw)).toBeUndefined();
		}
	});
	it('keeps the name optional, as the project id is what counts', () => {
		expect(parseLink(JSON.stringify({ v: 1, site: SITE, projectId: 5 }))).toEqual({ site: SITE, projectId: 5, name: '' });
	});
	it('is kept per project on the device', () => {
		expect(linkKey('p1')).toBe('link:p1');
	});
});

describe('linkOn', () => {
	it('holds on the site it was made on only', () => {
		expect(linkOn(LINK, SITE)).toEqual(LINK);
		expect(linkOn(LINK, 'https://other.shotgrid.autodesk.com')).toBeUndefined();
		expect(linkOn(LINK, null)).toBeUndefined();
		expect(linkOn(undefined, SITE)).toBeUndefined();
	});
});

describe('linkProblem', () => {
	it('allows any project while nothing of this one has synced', () => {
		expect(linkProblem(undefined, 1234)).toBeUndefined();
	});
	it('allows the project it already synced to', () => {
		expect(linkProblem(1234, 1234)).toBeUndefined();
	});
	it('refuses another project once it synced: its records are there', () => {
		expect(linkProblem(1234, 99)).toBe('otherProject');
	});
});

describe('linkStore', () => {
	it('keeps, reads and forgets the link of a project', async () => {
		const kv = memoryKeyValue();
		const links = linkStore(kv);
		expect(await links.get('p1')).toBeUndefined();
		await links.set('p1', LINK);
		expect(await links.get('p1')).toEqual(LINK);
		expect(await links.get('p2')).toBeUndefined();
		await links.remove('p1');
		expect(await links.get('p1')).toBeUndefined();
		expect(kv.map.size).toBe(0);
	});
});
