import { describe, expect, it } from 'vitest';
import { headFor, llmsTxt, pageMeta, sitemapXml, SITE, SITEMAP_PATHS } from './seo';

describe('seo', () => {
	it('gives the way in and the first run the app name and what it does', () => {
		expect(pageMeta('/').title).toBe('SG OnSet');
		expect(pageMeta('/welcome').title).toBe('SG OnSet');
		expect(pageMeta('/').description).toContain('Flow Production Tracking');
		expect(pageMeta('/').index).toBe(true);
		expect(pageMeta('/welcome').canonical).toBe(`${SITE}/`);
	});

	it('names each screen of the app, and keeps them out of search: they hold a person’s own data', () => {
		expect(pageMeta('/shoot').title).toBe('Shoot · SG OnSet');
		expect(pageMeta('/gear/import').title).toBe('Gear · SG OnSet');
		expect(pageMeta('/slates/abc').title).toBe('Slates · SG OnSet');
		expect(pageMeta('/shoot').index).toBe(false);
		expect(headFor('/shoot')).toContain('<meta name="robots" content="noindex" />');
	});

	it('an unknown path falls back to the app name and does not index', () => {
		expect(pageMeta('/nope').title).toBe('SG OnSet');
		expect(pageMeta('/nope').index).toBe(false);
		expect(headFor('/')).not.toContain('noindex');
	});

	it('writes the description, canonical, Open Graph and Twitter tags, and no title: the page sets it', () => {
		const h = headFor('/');
		expect(h).toContain('<meta name="description" content="');
		expect(h).toContain(`<link rel="canonical" href="${SITE}/" />`);
		expect(h).toContain('<meta property="og:title" content="SG OnSet" />');
		expect(h).toContain(`<meta property="og:image" content="${SITE}/og.png" />`);
		expect(h).toContain('<meta property="og:image:width" content="1200" />');
		expect(h).toContain('<meta name="twitter:card" content="summary_large_image" />');
		expect(h).not.toContain('<title>');
	});

	it('escapes what goes into an attribute', () => {
		expect(headFor('/')).not.toMatch(/content="[^"]*[<>][^"]*"/);
	});

	it('lists the indexed pages in the sitemap', () => {
		expect(SITEMAP_PATHS).toEqual(['/']);
		expect(sitemapXml()).toContain(`<loc>${SITE}/</loc>`);
	});

	it('says in llms.txt what the app does, and links the site and the repository', () => {
		const text = llmsTxt();
		expect(text.startsWith('# SG OnSet\n')).toBe(true);
		expect(text).toContain(`${SITE}/`);
		expect(text).toContain('https://github.com/ksallee/sg-onset');
		expect(text).toContain('offline');
	});
});
