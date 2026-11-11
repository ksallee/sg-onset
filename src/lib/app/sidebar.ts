// The sidebar's width in landscape, by destination. Pure. The capture destination keeps its own
// choice, collapsed at first, since the take screen needs the room; every other destination
// shares one. The button changes only the choice of the destination it is pressed on.

import type { Settings } from './settings';

type Choices = Pick<Settings, 'sidebar' | 'captureSidebar'>;

/** Whether the sidebar is a strip of icons. `focus`: the capture destination (nav.ts). */
export function sidebarStrip(settings: Choices, focus: boolean): boolean {
	return (focus ? settings.captureSidebar : settings.sidebar) === 'strip';
}

/** The settings patch the expand or collapse button makes. */
export function sidebarToggle(settings: Choices, focus: boolean): Partial<Choices> {
	const next = sidebarStrip(settings, focus) ? 'open' : 'strip';
	return focus ? { captureSidebar: next } : { sidebar: next };
}
