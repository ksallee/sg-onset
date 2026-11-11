<script lang="ts">
	// Settings. What a wrangler changes on set comes first and sits on the side of the holding
	// hand: the hand, the button size, the appearance, red night mode, motion, lengths. Then the
	// device's own: the project, Flow PT, the safety of the data with its snapshots, backup,
	// storage, about. Every control writes the
	// settings at once (lib/app/settings.svelte.ts); there is nothing to save. The order and the
	// rows are decided in lib/settings/groups.ts.
	import { version as build } from '$app/environment';
	import ActionSheet from '$lib/components/ios/ActionSheet.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import { auth } from '$lib/auth/session.svelte';
	import { removeSample } from '$lib/app/actions';
	import { useApp } from '$lib/app/app.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatDate } from '$lib/app/format';
	import { liveRecord } from '$lib/app/live.svelte';
	import { APPEARANCES, BUTTON_SIZES, MOTIONS, type Settings } from '$lib/app/settings';
	import { settings } from '$lib/app/settings.svelte';
	import { useShell } from '$lib/app/shell.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { t } from '$lib/i18n/messages';
	import { captureTarget } from '$lib/ios/target';
	import { readStandalone } from '$lib/pwa/platform';
	import { accountRows, sampleAction, sampleRemoval, versionLabel } from '$lib/settings/groups';
	import BackupSection from '$lib/settings/ui/BackupSection.svelte';
	import Choice from '$lib/settings/ui/Choice.svelte';
	import HandDiagram from '$lib/settings/ui/HandDiagram.svelte';
	import PrototypeNotice from '$lib/settings/ui/PrototypeNotice.svelte';
	import SafetySection from '$lib/settings/ui/SafetySection.svelte';
	import Setting from '$lib/settings/ui/Setting.svelte';
	import SideColumns from '$lib/settings/ui/SideColumns.svelte';
	import StorageSection from '$lib/settings/ui/StorageSection.svelte';
	import { version as release } from '../../../../package.json';

	const REPO = 'https://github.com/ksallee/sg-onset';

	const app = useApp();
	const current = useCurrent();
	const shell = useShell();
	const s = $derived(settings.value);
	const target = $derived(captureTarget(s.buttonSize === 'large'));
	const installed = readStandalone();

	// The project: its name is typed in place and saved on leaving the field.
	let name = $state('');
	let nameError = $state('');
	$effect(() => {
		name = current.project?.name ?? '';
	});
	async function rename(text: string) {
		const project = current.project;
		if (!project) return;
		if (text === '') {
			nameError = t('settings.project.name.required');
			name = project.name ?? '';
			return;
		}
		nameError = '';
		if (text !== project.name) await app.edit.set('project', project, 'name', text, { key: 'edit.changed', params: { field: t('settings.project.name') } });
	}
	const day = $derived.by(() => {
		const d = current.shootDay;
		if (!d) return t('settings.project.day.none');
		const n = dayName(d);
		return [t(n.key, n.params), formatDate(d.shootDate)].filter(Boolean).join(' · ');
	});

	// The sample project, if this device holds it.
	const sample = liveRecord('project', () => s.sampleProjectId);
	let confirmSample = $state(false);
	let dropping = false;
	async function dropSample() {
		if (!s.sampleProjectId || dropping) return;
		dropping = true;
		try {
			await removeSample(app, s.sampleProjectId);
			settings.update({ sampleProjectId: undefined });
		} finally {
			dropping = false;
		}
	}
	function askDropSample() {
		if (sampleRemoval(current.projects.length) === 'confirm') confirmSample = true;
		else void dropSample();
	}

	// Flow PT: who is signed in, and the sync detail the shell owns.
	const host = $derived(auth.site ? new URL(auth.site).host : '');
	const account = $derived(accountRows(auth.status)[0]);
	const sync = useSync();
	const signIn = '/sign-in?next=%2Fsettings';
</script>

<svelte:head><title>{t('nav.settings')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('nav.settings')} large />
	<SideColumns hand={s.hand}>
		{#snippet main()}
			<Section header={t('settings.handling')}>
				<Setting title={t('settings.hand')} hint={t('settings.hand.footer')}>
					{#snippet aside()}<HandDiagram hand={s.hand} label={t(`settings.hand.diagram.${s.hand}`)} />{/snippet}
					<Choice
						label={t('settings.hand')}
						options={[
							{ value: 'left', label: t('settings.hand.left') },
							{ value: 'right', label: t('settings.hand.right') }
						]}
						value={s.hand}
						onchange={(v) => settings.update({ hand: v as Settings['hand'] })}
					/>
				</Setting>
				<Setting title={t('settings.buttonSize')} hint="{t('settings.buttonSize.hint')} {t('settings.targets', { mm: target.mm })}">
					<Choice
						label={t('settings.buttonSize')}
						options={BUTTON_SIZES.map((size) => ({ value: size, label: t(`settings.buttonSize.${size}`) }))}
						value={s.buttonSize}
						onchange={(v) => settings.update({ buttonSize: v as Settings['buttonSize'] })}
					/>
				</Setting>
			</Section>

			<Section header={t('settings.look')}>
				<Setting title={t('settings.appearance')} hint={s.night ? t('settings.appearance.overridden') : t('settings.appearance.hint')}>
					<Choice
						label={t('settings.appearance')}
						options={APPEARANCES.map((a) => ({ value: a, label: t(`settings.appearance.${a}`) }))}
						value={s.appearance}
						onchange={(v) => settings.update({ appearance: v as Settings['appearance'] })}
					/>
				</Setting>
				<Setting title={t('settings.night')} hint={t('settings.night.hint')} inline>
					<Toggle checked={s.night} onchange={(night) => settings.update({ night })} label={t('settings.night')} />
				</Setting>
				<Setting title={t('settings.motion')} hint={t('settings.motion.footer')}>
					<Choice
						label={t('settings.motion')}
						options={MOTIONS.map((motion) => ({ value: motion, label: t(`settings.motion.${motion}`) }))}
						value={s.motion}
						onchange={(v) => settings.update({ motion: v as Settings['motion'] })}
					/>
				</Setting>
			</Section>

			<Section header={t('settings.units.header')}>
				<Setting title={t('settings.units')} hint={t('settings.units.footer')}>
					<Choice
						label={t('settings.units')}
						options={[
							{ value: 'metric', label: t('settings.units.metric') },
							{ value: 'imperial', label: t('settings.units.imperial') }
						]}
						value={s.units}
						onchange={(v) => settings.update({ units: v as Settings['units'] })}
					/>
				</Setting>
			</Section>
		{/snippet}

		{#snippet after()}
			<Section header={t('settings.project')} footer={sampleAction(!!sample.value) === 'delete' ? t('settings.sample.footer') : t('settings.project.footer')}>
				<InputRow label={t('settings.project.name')} bind:value={name} onchange={rename} error={nameError} oninput={() => (nameError = '')} autocapitalize="words" enterkeyhint="done" />
				<Row title={t('settings.project.day')} detail={day} />
				<Row title={t('settings.project.switch')} class="tint" onclick={() => shell.openContext()} />
				{#if sampleAction(!!sample.value) === 'delete'}
					<Row title={t('settings.sample.remove')} destructive onclick={askDropSample} />
				{/if}
			</Section>

			<Section header={t('settings.account')} footer={auth.status === 'expired' ? t('auth.expired') : t('settings.account.footer')}>
				{#if account === 'account'}
					<Row title={auth.user ?? ''} subtitle={host} href={signIn} />
				{:else}
					<Row
						title={account === 'signInAgain' ? t('sync.account.signInAgain') : t('sync.account.signIn')}
						detail={account === 'signInAgain' ? t('sync.account.expired') : t('sync.account.none')}
						href={signIn}
					/>
				{/if}
				<Row title={t('sync.status')} detail={t(sync.status.key, { n: sync.status.count })} chevron onclick={() => shell.openSync()} />
			</Section>

			<SafetySection />
			<BackupSection />
			<StorageSection />

			<Section header={t('settings.about')}>
				<Row title={t('settings.about.version')} detail={versionLabel(release, build)} />
				<Row title={t('settings.about.installed')} detail={installed ? t('settings.about.installed.yes') : t('settings.about.installed.no')} />
				<Row title={t('settings.about.licence')} detail={t('settings.about.licence.value')} href="{REPO}/blob/main/LICENSE" />
				<Row title={t('settings.about.source')} href={REPO} />
				<Row title={t('settings.about.issues')} href="{REPO}/issues" />
			</Section>
			<PrototypeNotice />
		{/snippet}
	</SideColumns>

	<ActionSheet
		bind:open={confirmSample}
		title={t('settings.sample.last.title')}
		message={t('settings.sample.last.message')}
		actions={[{ label: t('settings.sample.remove'), role: 'destructive', run: dropSample }]}
	/>
</Page>
