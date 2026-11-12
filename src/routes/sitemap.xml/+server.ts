import { sitemapXml } from '$lib/app/seo';

export const prerender = true;

export const GET = (): Response => new Response(sitemapXml(), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
