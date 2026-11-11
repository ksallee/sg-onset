<script lang="ts">
	// Settings: how the device is held and looks, the units, the account, storage, the backup.
	// Each control writes the settings at once (lib/app/settings.svelte.ts).
	import ActionSheet from '$lib/components/ios/ActionSheet.svelte';
	import Columns from '$lib/components/ios/Columns.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import BackupRows from '$lib/components/app/BackupRows.svelte';
	import { auth, signOut } from '$lib/auth/session.svelte';
	import { loadSample, removeSample } from '$lib/app/actions';
	import { useApp } from '$lib/app/app.svelte';
	import { live, liveRecord } from '$lib/app/live.svelte';
	import { APPEARANCES, BUTTON_SIZES, MOTIONS, type Settings } from '$lib/app/settings';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { captureTarget } from '$lib/ios/target';
	import { readStandalone } from '$lib/pwa/platform';
	import { storageUse } from '$lib/settings/storage';
	import { version } from '$app/environment';

	const app = useApp();
	const s = $derived(settings.value);
	const target = $derived(captureTarget(s.buttonSize === 'large'));
	const installed = readStandalone();

	// Storage: asked again after every write, and after the person asks to keep it.
	let asked = $state(0);
	let refused = $state(false);
	const storage = live([], (store) => {
		void asked;
		return store.storage();
	}, undefined);
	const use = $derived(storageUse(storage.value));
	async function keep() {
		refused = !(await app.store.persist());
		asked++;
	}

	// The sample project, if this device still has it.
	const sample = liveRecord('project', () => s.sampleProjectId);
	let confirmSample = $state(false);
	async function addSample() {
		const place = await loadSample(app);
		settings.update({ sampleProjectId: place.projectId });
	}
	async function dropSample() {
		if (!s.sampleProjectId) return;
		await removeSample(app, s.sampleProjectId);
		settings.update({ sampleProjectId: undefined });
	}

	const host = $derived(auth.site ? new URL(auth.site).host : '');
</script>

<svelte:head><title>{t('nav.settings')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('nav.settings')} large />
	<Columns>
		<div>
			<Section header={t('settings.handling')} footer={t('settings.hand.footer')}>
				<Row title={t('settings.hand')}>
					{#snippet trailing()}
						<div class="pick">
							<Segmented
								label={t('settings.hand')}
								options={[
									{ value: 'left', label: t('settings.hand.left') },
									{ value: 'right', label: t('settings.hand.right') }
								]}
								value={s.hand}
								onchange={(v) => settings.update({ hand: v as Settings['hand'] })}
							/>
						</div>
					{/snippet}
				</Row>
			</Section>

			<Section footer="{t('settings.buttonSize.hint')} {t('settings.targets', { mm: target.mm, px: target.size })}">
				<Row title={t('settings.buttonSize')}>
					{#snippet trailing()}
						<div class="pick">
							<Segmented
								label={t('settings.buttonSize')}
								options={BUTTON_SIZES.map((size) => ({ value: size, label: t(`settings.buttonSize.${size}`) }))}
								value={s.buttonSize}
								onchange={(v) => settings.update({ buttonSize: v as Settings['buttonSize'] })}
							/>
						</div>
					{/snippet}
				</Row>
			</Section>

			<Section header={t('settings.look')} footer={t('settings.night.footer')}>
				<Row title={t('settings.appearance')}>
					{#snippet trailing()}
						<div class="pick wide">
							<Segmented
								label={t('settings.appearance')}
								options={APPEARANCES.map((a) => ({ value: a, label: t(`settings.appearance.${a}`) }))}
								value={s.appearance}
								onchange={(v) => settings.update({ appearance: v as Settings['appearance'] })}
							/>
						</div>
					{/snippet}
				</Row>
				<Row title={t('settings.night')}>
					{#snippet trailing()}<Toggle checked={s.night} onchange={(night) => settings.update({ night })} label={t('settings.night')} />{/snippet}
				</Row>
			</Section>

			<Section footer={t('settings.motion.footer')}>
				<Row title={t('settings.motion')}>
					{#snippet trailing()}
						<div class="pick wide">
							<Segmented
								label={t('settings.motion')}
								options={MOTIONS.map((motion) => ({ value: motion, label: t(`settings.motion.${motion}`) }))}
								value={s.motion}
								onchange={(v) => settings.update({ motion: v as Settings['motion'] })}
							/>
						</div>
					{/snippet}
				</Row>
			</Section>

			<Section footer={t('settings.units.footer')}>
				<Row title={t('settings.units')}>
					{#snippet trailing()}
						<div class="pick">
							<Segmented
								label={t('settings.units')}
								options={[
									{ value: 'metric', label: t('settings.units.metric') },
									{ value: 'imperial', label: t('settings.units.imperial') }
								]}
								value={s.units}
								onchange={(v) => settings.update({ units: v as Settings['units'] })}
							/>
						</div>
					{/snippet}
				</Row>
			</Section>

			<Section header={t('settings.sample')} footer={t('settings.sample.footer')}>
				{#if sample.value}
					<Row title={t('settings.sample.remove')} destructive onclick={() => (confirmSample = true)} />
				{:else}
					<Row title={t('settings.sample.load')} class="tint" onclick={addSample} />
				{/if}
			</Section>
		</div>

		<div>
			<Section header={t('settings.account')} footer={auth.status === 'expired' ? t('auth.expired') : t('settings.account.footer')}>
				{#if auth.status === 'signed-in'}
					<Row title={t('settings.account.site')} detail={host} />
					<Row title={t('settings.account.user')} detail={auth.user ?? ''} />
					<Row title={t('sync.account.signOut')} destructive onclick={signOut} />
				{:else}
					<Row
						title={auth.status === 'expired' ? t('sync.account.signInAgain') : t('sync.account.signIn')}
						detail={auth.status === 'expired' ? t('sync.account.expired') : t('sync.account.none')}
						href="/sign-in"
					/>
				{/if}
			</Section>

			<Section header={t('settings.storage')} footer={refused ? t('settings.storage.refused') : storage.value?.persisted ? t('settings.storage.footer.kept') : t('settings.storage.footer.notKept')}>
				<Row title={t('settings.storage.kept')} detail={storage.value?.persisted ? t('settings.storage.kept.yes') : t('settings.storage.kept.no')} />
				<Row title={t('settings.storage.used')} detail={use ? t('settings.storage.used.value', use) : t('settings.storage.unknown')} />
				{#if storage.value && !storage.value.persisted}
					<Row title={t('settings.storage.ask')} class="tint" onclick={keep} />
				{/if}
			</Section>

			<Section header={t('backup.header')} footer={t('backup.footer')}>
				<BackupRows restore />
			</Section>

			<Section header={t('settings.about')}>
				<Row title={t('settings.about.version')} detail={version.slice(0, 12)} />
				<Row title={t('settings.about.installed')} detail={installed ? t('settings.about.installed.yes') : t('settings.about.installed.no')} />
				<Row title={t('settings.about.proto')} href="/proto/take" />
			</Section>
		</div>
	</Columns>

	<ActionSheet
		bind:open={confirmSample}
		title={t('settings.sample.remove')}
		actions={[{ label: t('common.delete'), role: 'destructive', run: dropSample }]}
	/>
</Page>

<style>
	.pick {
		width: 168px;
		margin: -5px 0;
	}
	.pick.wide {
		width: 228px;
	}
</style>
