// The destinations of the app, as data: the shell draws its navigation from this list. Pure.
// The icon of each is in components/app/AppShell.svelte, by id.

import type { MessageKey } from '$lib/i18n/messages';

export type NavId = 'shoot' | 'slates' | 'gear' | 'templates' | 'settings';

export interface NavEntry {
	id: NavId;
	href: string;
	labelKey: MessageKey;
	/**
	 * The destination needs the room and the calm of the capture path: in landscape the sidebar
	 * shows as a strip there, and the shell shows no notice of its own (the page shows its own).
	 */
	focus?: true;
	/** Other paths that belong to this destination. */
	also?: readonly string[];
}

export const NAV: readonly NavEntry[] = [
	{ id: 'shoot', href: '/shoot', labelKey: 'nav.shoot', focus: true },
	{ id: 'slates', href: '/slates', labelKey: 'nav.slates' },
	{ id: 'gear', href: '/gear', labelKey: 'nav.gear' },
	{ id: 'templates', href: '/templates', labelKey: 'nav.templates' },
	{ id: 'settings', href: '/settings', labelKey: 'nav.settings', also: ['/sign-in'] }
];

/** The destination a page belongs to: its own path, or any path under it. */
export function activeNav(pathname: string, nav: readonly NavEntry[] = NAV): NavEntry | undefined {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	const under = (root: string) => path === root || path.startsWith(`${root}/`);
	return nav.find((entry) => under(entry.href) || !!entry.also?.some(under));
}
