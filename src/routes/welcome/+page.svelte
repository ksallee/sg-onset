<script lang="ts">
	// The first run: what the app is, then a project and its first shoot day, or the sample
	// project. The form sits on the side of the holding hand. Signing in to Flow PT and adding
	// the app to the Home Screen are offered here and never required. Also the way to one more
	// project, from the picker: then it is a plain form with a way back. What shows, what stops
	// the form and where it lands are decided in lib/settings/firstRun.ts.
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { createFirstRun, loadSample } from '$lib/app/actions';
	import { useApp } from '$lib/app/app.svelte';
	import { today } from '$lib/app/format';
	import { liveList, liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { auth } from '$lib/auth/session.svelte';
	import { t } from '$lib/i18n/messages';
	import { readInstallHint } from '$lib/pwa/platform';
	import { device } from '$lib/settings/device.svelte';
	import { afterCreate, draftOf, firstProblem, firstRunMode, firstRunProblems, installOffer, parseDraft, serializeDraft } from '$lib/settings/firstRun';
	import InstallSteps from '$lib/settings/ui/InstallSteps.svelte';
	import PrototypeNotice from '$lib/settings/ui/PrototypeNotice.svelte';
	import SideColumns from '$lib/settings/ui/SideColumns.svelte';

	/** What is typed is kept here until the project is made, so a reload loses nothing. */
	const DRAFT_KEY = 'sg-onset.firstRun';

	const app = useApp();
	const projects = liveList('project');
	// Decided once: the page must not change under the person as their project is saved.
	let mode = $state<'first' | 'another' | null>(null);
	$effect(() => {
		if (projects.ready && mode === null) mode = firstRunMode(projects.value.length);
	});

	function kept() {
		try {
			return parseDraft(sessionStorage.getItem(DRAFT_KEY));
		} catch {
			return undefined;
		}
	}
	let draft = $state(draftOf(kept(), today(new Date(app.now()))));
	$effect(() => {
		const text = serializeDraft(draft);
		try {
			sessionStorage.setItem(DRAFT_KEY, text);
		} catch {
			// Kept for this page only.
		}
	});

	// Problems show once the person has asked to create, and go as each is fixed.
	let attempted = $state(false);
	const problems = $derived(firstRunProblems(draft));
	const shown = $derived(attempted ? problems : {});
	const say = (key: keyof typeof shown) => (shown[key] ? t(shown[key]) : undefined);
	let more = $state(draft.location !== '' || draft.dayNumber !== '1');
	let form = $state<HTMLFormElement | null>(null);

	let busy = $state(false);
	let failed = $state(false);

	async function create(signIn: boolean) {
		if (busy) return;
		attempted = true;
		const field = firstProblem(problems);
		if (field) {
			if (field === 'dayNumber') more = true;
			// After the row is there.
			requestAnimationFrame(() => form?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus());
			return;
		}
		busy = true;
		failed = false;
		try {
			settings.place(await createFirstRun(app, draft));
			try {
				sessionStorage.removeItem(DRAFT_KEY);
			} catch {
				// Nothing kept.
			}
			await goto(afterCreate(signIn));
		} catch {
			failed = true;
			busy = false;
		}
	}

	const sampleHeld = liveRecord('project', () => settings.value.sampleProjectId);
	async function sample() {
		if (busy) return;
		busy = true;
		failed = false;
		try {
			const place = await loadSample(app);
			settings.update({ sampleProjectId: place.projectId });
			settings.place(place);
			await goto('/shoot');
		} catch {
			failed = true;
			busy = false;
		}
	}

	const offer = $derived(mode === 'first' ? installOffer(readInstallHint(), device.value.installDismissed) : 'none');
</script>

<svelte:head><title>{mode === 'another' ? t('welcome.project.new') : t('welcome.title')} · {t('app.name')}</title></svelte:head>

{#snippet fields()}
	<form bind:this={form} onsubmit={(e) => (e.preventDefault(), void create(false))} novalidate>
		<Section header={mode === 'first' ? t('welcome.project') : t('scope.project')}>
			<InputRow label={t('welcome.project.name')} name="name" bind:value={draft.name} error={say('name')} placeholder={t('welcome.project.placeholder')} autocapitalize="words" enterkeyhint="next" />
		</Section>
		<Section header={t('welcome.day')} footer={t('welcome.day.footer')}>
			<InputRow label={t('welcome.day.date')} name="date" bind:value={draft.date} error={say('date')} type="date" />
			<InputRow label={t('welcome.day.unit')} name="unit" bind:value={draft.unit} placeholder={t('welcome.day.unit.placeholder')} autocapitalize="words" enterkeyhint="done" />
			{#if more}
				<InputRow label={t('welcome.day.number')} name="dayNumber" bind:value={draft.dayNumber} error={say('dayNumber')} inputmode="numeric" />
				<InputRow label={t('welcome.day.location')} name="location" bind:value={draft.location} placeholder={t('welcome.day.location.placeholder')} enterkeyhint="done" />
			{:else}
				<Row title={t('welcome.day.more')} class="tint" onclick={() => (more = true)} />
			{/if}
		</Section>
		{#if failed}<p class="failed" role="alert">{t('welcome.failed')}</p>{/if}
		<div class="actions">
			<Button variant="filled" size="large" full type="submit" disabled={busy}>{t('welcome.start')}</Button>
			{#if mode === 'first' && auth.status !== 'signed-in'}
				<Button variant="tinted" size="large" full disabled={busy} onclick={() => create(true)}>{t('welcome.createSignIn')}</Button>
			{/if}
		</div>
		{#if mode === 'first'}
			{#if auth.status !== 'signed-in'}<p class="note optional">{t('auth.optional')}</p>{/if}
			<p class="note">{t('welcome.footer')}</p>
		{/if}
	</form>
{/snippet}

{#snippet sampleSection()}
	<Section header={t('welcome.or')} footer={t('welcome.sample.footer')}>
		<Row title={t('welcome.sample')} class="tint" onclick={sample} />
	</Section>
{/snippet}

<!-- Only once the mode is known: the page's column must not change width under its content. -->
{#if mode}
<Page width={mode === 'another' ? 'form' : 'columns'}>
	{#if mode === 'another'}
		<NavBar title={t('welcome.project.new')} large back={{ label: t('common.back'), onclick: () => history.back() }} />
		{@render fields()}
		{#if !sampleHeld.value}{@render sampleSection()}{/if}
	{:else if mode === 'first'}
		<header class="brand">
			<!-- The lockup from the icon work (docs/design/icon.md), 40 px tall: one drawing per
			     ground. Both are decoration: the heading's name is the text, which is all that
			     shows in red night mode, where there is no red-only lockup. -->
			<h1 class="wordmark">
				<img class="lockup on-light" src="/brand/lockup-light.svg" alt="" aria-hidden="true" height="40" />
				<img class="lockup on-dark" src="/brand/lockup-dark.svg" alt="" aria-hidden="true" height="40" />
				<span class="name">{t('welcome.title')}</span>
			</h1>
			<p class="tagline">{t('app.tagline')}</p>
		</header>
		<SideColumns hand={settings.value.hand}>
			{#snippet before()}
				<p class="lead">{t('welcome.lead')}</p>
				{#if !device.value.prototypeDismissed}
					<PrototypeNotice ondismiss={() => device.update({ prototypeDismissed: true })} />
				{/if}
				{#if offer !== 'none'}
					<section class="install" aria-labelledby="install-title">
						<h2 id="install-title">{t('welcome.install.title')}</h2>
						<p>{t('welcome.install.why')}</p>
						<InstallSteps how={offer} />
						<div class="dismiss">
							<Button variant="plain" size="large" onclick={() => device.update({ installDismissed: true })}>{t('welcome.install.dismiss')}</Button>
						</div>
					</section>
				{/if}
			{/snippet}
			{#snippet main()}{@render fields()}{/snippet}
			{#snippet after()}{@render sampleSection()}{/snippet}
		</SideColumns>
	{/if}
</Page>
{/if}

<style>
	.brand {
		flex: none;
		padding: calc(var(--safe-top) + 36px) calc(var(--page-margin, 16px) + 16px) 20px;
	}
	.wordmark {
		position: relative;
		min-height: 40px;
	}
	.lockup {
		display: block;
		height: 40px;
		width: auto;
	}
	:global([data-theme='dark']) .on-light,
	:global([data-theme='light']) .on-dark,
	:global([data-night='true']) .lockup {
		display: none;
	}
	/* The name: read by a screen reader always, seen in red night mode only. */
	.name {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	:global([data-night='true']) .name {
		position: static;
		display: block;
		width: auto;
		height: auto;
		clip-path: none;
		font-size: 34px;
		line-height: 40px;
		font-weight: 700;
		letter-spacing: -0.025em;
		color: var(--label);
	}
	.tagline {
		margin-top: 12px;
		max-width: 30em;
		font-size: 20px;
		line-height: 25px;
		letter-spacing: -0.45px;
		color: var(--label-2);
	}
	.lead {
		padding: 0 calc(var(--page-margin, 16px) + 16px) 28px;
		max-width: 34em;
		font-size: 17px;
		line-height: 24px;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.install {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0 var(--page-margin, 16px) 32px;
		padding: 18px 16px 6px;
		border-radius: 24px;
		background: var(--group-bg, var(--cell));
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.install h2 {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.dismiss {
		display: flex;
		justify-content: flex-end;
		margin-right: -8px;
	}
	:global(html[data-hand='left']) .dismiss {
		justify-content: flex-start;
		margin: 0 0 0 -8px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 14px;
	}
	.note.optional {
		margin-bottom: 10px;
	}
	.note,
	.failed {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-bottom: 32px;
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
	}
	.failed {
		margin-top: -14px;
		margin-bottom: 16px;
		font-size: 15px;
		line-height: 20px;
		color: var(--destructive);
	}
</style>
