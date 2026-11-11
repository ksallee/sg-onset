// Writes tokens.css from palette.ts. Every selector is wrapped in :where(), so none outranks
// another and source order decides: light, then dark, then night, each followed by its
// increased-contrast values. A subtree with its own data-theme or data-night (a preview, the
// specimen page) redeclares every token, so it never inherits its parent's. Pure.
// Imports carry `.ts` so `node scripts/theme-tokens.mjs` can run this without a bundler.
import { TOKENS, type Group, type Mode, type Token } from './palette.ts';

const GROUP_TITLES: Record<Group, string> = {
	background: 'Backgrounds',
	label: 'Labels',
	separator: 'Separators',
	fill: 'Fills',
	tint: 'Tint',
	status: 'Status',
	focus: 'Focus',
	material: 'Materials',
	elevation: 'Elevation',
	keypad: 'Keypad',
	rail: 'Rail'
};

/** Derived from the tokens, the same in every mode: a status chip's background. */
const STATUS = ['good', 'no-good', 'warning', 'unsynced', 'synced', 'conflict', 'rolling'];

function decls(tokens: readonly Token[], pick: (t: Token) => string | undefined, groups: boolean): string {
	const out: string[] = [];
	let group: Group | undefined;
	for (const t of tokens) {
		const v = pick(t);
		if (v === undefined) continue;
		if (groups && t.group !== group) {
			group = t.group;
			out.push(`\t/* ${GROUP_TITLES[group]} */`);
		}
		out.push(`\t--${t.name}: ${v};`);
	}
	return out.join('\n');
}

const block = (selector: string, body: string, indent = '') =>
	`${indent}${selector} {\n${body
		.split('\n')
		.map((l) => indent + l)
		.join('\n')}\n${indent}}`;

const media = (query: string, inner: string) =>
	`@media ${query} {\n${inner
		.split('\n')
		.map((l) => (l ? `\t${l}` : l))
		.join('\n')}\n}`;

const where = (...sels: string[]) => `:where(${sels.join(', ')})`;

const ROOT = ':root:not([data-theme])';
const SEL: Record<Mode, string> = {
	light: "[data-theme='light']",
	dark: "[data-theme='dark']",
	night: "[data-night='true']"
};
const MORE = "[data-contrast='more']";
const NOT_NORMAL = ":not([data-contrast='normal'])";

function full(mode: Mode): string {
	const scheme = mode === 'light' ? 'light' : 'dark';
	return `\tcolor-scheme: ${scheme};\n${decls(TOKENS, (t) => t[mode], true)}`;
}

function more(mode: Mode): string {
	return decls(TOKENS, (t) => t.more?.[mode], false);
}

export function renderCss(): string {
	const parts: string[] = [
		`/* sg-onset colour and material tokens. GENERATED from palette.ts by css.ts: do not edit.
   Run \`node scripts/theme-tokens.mjs\` after changing palette.ts. Reasons: docs/design/colour.md.

   Keys, on <html> or any subtree:
     data-theme="light|dark"   the appearance (no attribute: the system's, prefers-color-scheme)
     data-night="true"         red night mode, over either appearance
     data-contrast="more"      increased contrast forced on (also on with prefers-contrast: more,
                               unless data-contrast="normal") */`
	];

	// Light: the default, and data-theme="light".
	parts.push(block(where(ROOT, SEL.light), full('light')));
	parts.push(block(where(`${ROOT}${MORE}`, `${SEL.light}${MORE}`), more('light')));
	parts.push(media('(prefers-contrast: more)', block(where(`${ROOT}${NOT_NORMAL}`, `${SEL.light}${NOT_NORMAL}`), more('light'))));

	// Dark: the system's, then data-theme="dark".
	parts.push(media('(prefers-color-scheme: dark)', block(where(ROOT), full('dark'))));
	parts.push(block(where(SEL.dark), full('dark')));
	parts.push(media('(prefers-color-scheme: dark)', block(where(`${ROOT}${MORE}`), more('dark'))));
	parts.push(block(where(`${SEL.dark}${MORE}`), more('dark')));
	parts.push(media('(prefers-color-scheme: dark) and (prefers-contrast: more)', block(where(`${ROOT}${NOT_NORMAL}`), more('dark'))));
	parts.push(media('(prefers-contrast: more)', block(where(`${SEL.dark}${NOT_NORMAL}`), more('dark'))));

	// Night: over either appearance.
	parts.push(block(where(SEL.night), full('night')));
	parts.push(block(where(`${SEL.night}${MORE}`), more('night')));
	parts.push(media('(prefers-contrast: more)', block(where(`${SEL.night}${NOT_NORMAL}`), more('night'))));

	// Derived, the same in every mode. Declared wherever a mode is, so a subtree derives its own.
	const any = where(':root', '[data-theme]', '[data-night]');
	parts.push(
		block(
			any,
			STATUS.map((s) => `\t--${s}-fill: color-mix(in srgb, var(--${s}) var(--status-fill), transparent);`).join('\n')
		)
	);
	parts.push(
		media(
			'(prefers-reduced-transparency: reduce)',
			block(any, '\t--mat-bar: var(--mat-bar-solid);\n\t--mat-sheet: var(--mat-sheet-solid);')
		)
	);

	return `${parts.join('\n\n')}\n`;
}

