<script lang="ts">
	// The take screen prototype (#1): mock data, in memory. The state is lib/take/screen.svelte.ts,
	// the parts are lib/components/take, the frame is the kit's Workspace. `?hand=left&theme=night
	// &gloves=1` opens a given setup.
	import { page } from '$app/state';
	import Workspace from '$lib/components/ios/Workspace.svelte';
	import CaptureRail from '$lib/components/take/CaptureRail.svelte';
	import NumberDock from '$lib/components/take/NumberDock.svelte';
	import SetupPanel from '$lib/components/take/SetupPanel.svelte';
	import TakeDetail from '$lib/components/take/TakeDetail.svelte';
	import TakeList from '$lib/components/take/TakeList.svelte';
	import TakeTray from '$lib/components/take/TakeTray.svelte';
	import UndoNotice from '$lib/components/take/UndoNotice.svelte';
	import { t } from '$lib/i18n/messages';
	import { captureTarget } from '$lib/ios/target';
	import { TakeScreen } from '$lib/take/screen.svelte';
	import { parseSettings, themeClass } from '$lib/take/settings';

	const screen = new TakeScreen();
	let settings = $state(parseSettings(page.url.searchParams));
	let settingsOpen = $state(false);
	const target = $derived(captureTarget(settings.gloves));

	// The clock runs only while a take rolls.
	$effect(() => {
		if (!screen.rolling) return;
		const timer = setInterval(() => screen.tick(), 250);
		return () => clearInterval(timer);
	});
	$effect(() => () => screen.destroy());
</script>

<svelte:head><title>{t('take.title')} {screen.take.slate}/{screen.take.take} · {t('app.name')}</title></svelte:head>

{#snippet panel(at: 'left' | 'right' | 'below')}
	{#if settingsOpen}
		<SetupPanel {settings} {at} onchange={(s) => (settings = s)} onclose={() => (settingsOpen = false)} />
	{/if}
{/snippet}

<Workspace hand={settings.hand} target={target.size} gap={target.gap} class={themeClass(settings.theme)}>
	{#snippet list(at, form)}
		<TakeList
			{at}
			takes={screen.session.takes}
			currentId={screen.take.id}
			now={screen.now}
			onselect={(id) => screen.select(id)}
			onsettings={form === 'compact' ? () => (settingsOpen = !settingsOpen) : undefined}
			{settingsOpen}
		/>
		{#if form === 'compact'}{@render panel('below')}{/if}
	{/snippet}
	{#snippet main()}
		<TakeDetail {screen} />
		{#if screen.notice}
			<UndoNotice text={screen.notice.text} undoable={screen.notice.undoable} onundo={() => screen.undo()} />
		{/if}
	{/snippet}
	{#snippet dock(form)}
		{#if screen.field}
			<NumberDock {screen} {form} hand={settings.hand} gloves={settings.gloves} />
		{:else}
			<TakeTray {screen} {form} />
		{/if}
	{/snippet}
	{#snippet rail(edge)}
		<CaptureRail {screen} {edge} {settingsOpen} onsettings={() => (settingsOpen = !settingsOpen)} />
		{#if edge === 'left' || edge === 'right'}{@render panel(edge)}{/if}
	{/snippet}
</Workspace>
