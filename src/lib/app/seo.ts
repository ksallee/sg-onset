// What a crawler and a link preview read. The app renders in the browser only (`+layout.ts`:
// `ssr = false`), so `src/hooks.server.ts` writes these tags into the shell per path;
// `/sitemap.xml` and `/llms.txt` come from here too. The title stays the page's own
// (`<svelte:head>`), which the server shell does not run: the link preview reads `og:title`.
// Pure.

export const SITE = 'https://sg-onset.vercel.app';
export const REPO = 'https://github.com/ksallee/sg-onset';
const NAME = 'SG OnSet';
const LINE = 'On-set VFX data capture for Flow Production Tracking.';
const ABOUT = `${LINE} Log slates, takes, cameras, lenses and reference photos on an iPad or a phone. It works with no network and syncs to your Flow PT site when you want. Free and open source.`;

export type PageMeta = { title: string; description: string; canonical: string; index: boolean };

/** The app's screens, by the first part of the path. They hold a person's own data. */
const SCREENS: Record<string, string> = {
	shoot: 'Shoot',
	slates: 'Slates',
	wrap: 'Wrap',
	gear: 'Gear',
	templates: 'Templates',
	settings: 'Settings',
	'sign-in': 'Sign In'
};

/** The paths worth a search result. */
export const SITEMAP_PATHS = ['/'];

export function pageMeta(path: string): PageMeta {
	const home = { title: NAME, description: ABOUT, canonical: `${SITE}/` };
	if (path === '/' || path === '/welcome') return { ...home, index: true };
	const screen = SCREENS[path.split('/')[1] ?? ''];
	if (screen) return { ...home, title: `${screen} · ${NAME}`, index: false };
	return { ...home, index: false };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The head tags for a path. */
export function headFor(path: string): string {
	const m = pageMeta(path);
	const t = esc(m.title);
	const d = esc(m.description);
	const img = `${SITE}/og.png`;
	const alt = esc(`${NAME}: ${LINE}`);
	return [
		`<meta name="description" content="${d}" />`,
		m.index ? '' : '<meta name="robots" content="noindex" />',
		`<link rel="canonical" href="${m.canonical}" />`,
		`<meta property="og:type" content="website" />`,
		`<meta property="og:site_name" content="${NAME}" />`,
		`<meta property="og:title" content="${t}" />`,
		`<meta property="og:description" content="${d}" />`,
		`<meta property="og:url" content="${m.canonical}" />`,
		`<meta property="og:image" content="${img}" />`,
		`<meta property="og:image:width" content="1200" />`,
		`<meta property="og:image:height" content="630" />`,
		`<meta property="og:image:alt" content="${alt}" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="${t}" />`,
		`<meta name="twitter:description" content="${d}" />`,
		`<meta name="twitter:image" content="${img}" />`
	]
		.filter(Boolean)
		.join('\n\t\t');
}

export function sitemapXml(): string {
	const urls = SITEMAP_PATHS.map((p) => `\t<url><loc>${SITE}${p}</loc></url>`).join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function llmsTxt(): string {
	return `# ${NAME}

> ${LINE} A web app for VFX supervisors and data wranglers, for Flow PT (formerly ShotGrid). It installs to the Home Screen of an iPad or a phone, works offline, and syncs to the studio's Flow PT site later. Free, open source, MIT.

## What it does

- Slates and takes: Start and End stamp a take's times. Each camera of a take has its own lens, focal length, stop, focus, height, tilt and more.
- Reference photos attach to the take.
- Gear: cameras, lenses and camera setups (A, B, C). A built-in library of common camera bodies and lens sets, and CSV import.
- Templates: a slate or take made from a template follows its later edits.
- Bulk edit: one field changed on many takes.
- Wrap: the day's summary and exports (CSV, JSON, zip backup).
- Offline first: the data is kept on the device. Sync to Flow PT is optional and signed in as yourself.

## Pages

- [App](${SITE}/): opens the app. The first run makes a project, or loads a sample project.

## Source

- [Repository](${REPO})
`;
}
