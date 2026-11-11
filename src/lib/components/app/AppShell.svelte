<script lang="ts">
	// The app's frame: the kit's NavShell with the five destinations (app/nav.ts), the sync
	// status, the project and day picker, the sync detail and the notice of the last edit with
	// its Undo. The holding hand and the sidebar's width come from the settings.
	import type { Component, Snippet } from 'svelte';
	import { Aperture, Camera, Clapperboard, LayoutTemplate, SlidersHorizontal } from '@lucide/svelte';
	import { page } from '$app/state';
	import NavShell from '$lib/components/ios/NavShell.svelte';
	import Notice from '$lib/components/ios/Notice.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveUnsynced } from '$lib/app/live.svelte';
	import { NAV, activeNav, type NavId } from '$lib/app/nav';
	import { settings } from '$lib/app/settings.svelte';
	import { provideShell } from '$lib/app/shell.svelte';
	import { sidebarStrip, sidebarToggle } from '$lib/app/sidebar';
	import { useCurrent } from '$lib/app/current.svelte';
	import { provideSync } from '$lib/app/sync/controller.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import ContextSheet from './ContextSheet.svelte';
	import SyncSheet from './SyncSheet.svelte';
	import SyncStatus from './SyncStatus.svelte';

	let { children }: { children: Snippet } = $props();

	const ICONS: Record<NavId, Component<{ class?: string; strokeWidth?: number }>> = {
		shoot: Aperture,
		slates: Clapperboard,
		gear: Camera,
		templates: LayoutTemplate,
		settings: SlidersHorizontal
	};
	const items = NAV.map((entry) => ({ id: entry.id, href: entry.href, label: t(entry.labelKey), icon: ICONS[entry.id] }));

	const app = useApp();
	const unsynced = liveUnsynced();
	const current = useCurrent();
	// Sync runs from here: linked, set up and signed in, for the current project (app/sync).
	const sync = provideSync(
		() => current.project?.id,
		() => unsynced.value
	);
	const active = $derived(activeNav(page.url.pathname));
	const strip = $derived(sidebarStrip(settings.value, !!active?.focus));

	let contextOpen = $state(false);
	let syncOpen = $state(false);
	provideShell({ openContext: () => (contextOpen = true), openSync: () => (syncOpen = true) });

	// The last edit, said for a few seconds. Not on a focus page: the capture path shows its own.
	const NOTICE_MS = 6000;
	const edit = $derived(active?.focus ? null : app.lastEdit);
	const what = $derived(edit?.label ? tk(edit.label.key, edit.label.params) : '');
	const notice = $derived.by(() => {
		if (!edit) return null;
		if (edit.kind === 'tooLate') return { text: t('notice.tooLate') };
		if (!what) return null;
		if (edit.kind === 'undone') return { text: t('notice.undone', { what }), action: t('notice.redo'), run: () => app.edit.redo() };
		if (edit.kind === 'redone') return { text: t('notice.redone', { what }), action: t('notice.undo'), run: () => app.edit.undo() };
		return { text: what, action: t('notice.undo'), run: () => app.edit.undo() };
	});
	$effect(() => {
		if (!edit) return;
		const timer = setTimeout(() => app.dismissEdit(), Math.max(0, edit.at + NOTICE_MS - Date.now()));
		return () => clearTimeout(timer);
	});

	// Undo and redo from a keyboard, when no field is being typed in (a field has its own undo).
	function key(event: KeyboardEvent) {
		if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
		if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
		event.preventDefault();
		void (event.shiftKey ? app.edit.redo() : app.edit.undo());
	}
</script>

<svelte:window onkeydown={key} />

<NavShell
	{items}
	active={active?.id}
	hand={settings.value.hand}
	{strip}
	focus={!!active?.focus}
	label={t('nav.label')}
	title={t('app.name')}
	ontoggle={() => settings.update(sidebarToggle(settings.value, !!active?.focus))}
	toggleLabel={strip ? t('nav.expand') : t('nav.collapse')}
>
	{#snippet status(placement)}
		<SyncStatus summary={sync.status} {placement} onclick={() => (syncOpen = true)} />
	{/snippet}
	{@render children()}
	{#if notice}
		{#key edit?.at}
			<Notice text={notice.text} action={notice.action} onaction={notice.run} />
		{/key}
	{/if}
	<ContextSheet bind:open={contextOpen} />
	<SyncSheet bind:open={syncOpen} />
</NavShell>
