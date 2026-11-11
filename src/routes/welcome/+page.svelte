<script lang="ts">
	// The first run: a project and its first shoot day, or the sample project. Also the way to
	// a second project, from the picker: then it has a way back and no sample.
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { createFirstRun, loadSample } from '$lib/app/actions';
	import { useApp } from '$lib/app/app.svelte';
	import { today } from '$lib/app/format';
	import { liveList } from '$lib/app/live.svelte';
	import { firstRunProblem } from '$lib/app/records';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';

	const app = useApp();
	const projects = liveList('project');
	const first = $derived(projects.value.length === 0);

	let name = $state('');
	let date = $state(today(new Date(app.now())));
	let dayNumber = $state('1');
	let unit = $state('');
	let location = $state('');
	let busy = $state(false);
	const input = $derived({ name, date, dayNumber, unit, location });

	async function start(event: SubmitEvent) {
		event.preventDefault();
		if (busy || firstRunProblem(input)) return;
		busy = true;
		settings.place(await createFirstRun(app, input));
		await goto('/slates');
	}
	async function sample() {
		if (busy) return;
		busy = true;
		const place = await loadSample(app);
		settings.update({ sampleProjectId: place.projectId });
		settings.place(place);
		await goto('/shoot');
	}
</script>

<svelte:head><title>{first ? t('welcome.title') : t('welcome.project.new')} · {t('app.name')}</title></svelte:head>

<Page width={first ? 'columns' : 'form'}>
	{#if projects.ready}
		<NavBar title={first ? t('welcome.title') : t('welcome.project.new')} large back={first ? undefined : { label: t('common.back'), onclick: () => history.back() }} />
		{#if first}<p class="lead"><span>{t('welcome.lead')}</span></p>{/if}

		{#snippet form()}
			<form onsubmit={start} novalidate>
				<Section header={first ? t('welcome.project') : t('scope.project')}>
					<InputRow label={t('welcome.project.name')} bind:value={name} placeholder={t('welcome.project.placeholder')} autocapitalize="words" enterkeyhint="next" />
				</Section>
				<Section header={t('welcome.day')}>
					<InputRow label={t('welcome.day.date')} bind:value={date} type="date" />
					<InputRow label={t('welcome.day.number')} bind:value={dayNumber} inputmode="numeric" />
					<InputRow label={t('welcome.day.unit')} bind:value={unit} placeholder={t('welcome.day.unit.placeholder')} autocapitalize="words" />
					<InputRow label={t('welcome.day.location')} bind:value={location} placeholder={t('welcome.day.location.placeholder')} enterkeyhint="go" />
				</Section>
				<div class="actions">
					<Button variant="filled" size="large" full type="submit" disabled={busy || !!firstRunProblem(input)}>{first ? t('welcome.start') : t('common.create')}</Button>
				</div>
			</form>
		{/snippet}

		{#if first}
			<Columns>
				<div>{@render form()}</div>
				<div>
					<Section header={t('welcome.or')} footer={t('welcome.sample.footer')}>
						<Row title={t('welcome.sample')} class="tint" onclick={sample} />
					</Section>
					<p class="note">{t('welcome.footer')}</p>
				</div>
			</Columns>
		{:else}
			{@render form()}
		{/if}
	{/if}
</Page>

<style>
	.lead {
		padding: 0 calc(var(--page-margin, 16px) + var(--title-inset, 0px)) 28px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label-2);
	}
	.lead span {
		display: block;
		max-width: 520px;
	}
	.actions {
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 40px;
	}
	.note {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
</style>
