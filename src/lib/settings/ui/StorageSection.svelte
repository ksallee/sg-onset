<script lang="ts">
	// The Storage section of Settings: is the data safe from the browser's cleanup, in plain
	// words, what to do about it, and how much room there is. The wording is decided in
	// storageAdvice.ts. Read again after the person asks the browser to protect the data.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { live } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import { readInstallHint, readStandalone } from '$lib/pwa/platform';
	import { storageAdvice } from '../storageAdvice';
	import InstallSteps from './InstallSteps.svelte';

	const app = useApp();
	const supported = typeof navigator !== 'undefined' && !!navigator.storage;
	const standalone = readStandalone();
	const hint = readInstallHint();

	let asked = $state(0);
	let asking = $state(false);
	let refused = $state(false);
	const storage = live(
		[],
		(store) => {
			void asked;
			return store.storage();
		},
		undefined
	);
	const advice = $derived(storageAdvice({ supported, status: storage.value, standalone, hint, refused }));

	async function ask() {
		if (asking) return;
		asking = true;
		try {
			refused = !(await app.store.persist());
		} finally {
			asking = false;
			asked++;
		}
	}
</script>

<Section header={t('settings.storage')}>
	{#if advice}
		<Row title={t('settings.storage.protection')}>
			{#snippet trailing()}<span class="state" data-level={advice.level}>{t(advice.state)}</span>{/snippet}
		</Row>
		<div class="note" role="listitem">
			<p>{t(advice.body)}</p>
			{#if advice.action === 'install'}<InstallSteps how="ios-share" />{/if}
			{#if advice.low}<p class="low">{t('settings.storage.low')}</p>{/if}
		</div>
		{#if advice.action === 'ask'}
			<Row title={t('settings.storage.ask')} class="tint" onclick={ask} />
		{/if}
		<Row title={t('settings.storage.used')} detail={advice.used ?? t('settings.storage.unknown')} class={advice.used ? '' : 'quiet'} />
		<Row title={t('settings.storage.free')} detail={advice.free ?? t('settings.storage.unknown')} class={advice.free ? '' : 'quiet'} />
	{:else}
		<Row title={t('settings.storage.protection')} detail={t('common.loading')} class="quiet" />
	{/if}
</Section>

<style>
	.state {
		flex: none;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.state[data-level='at-risk'] {
		color: var(--warning);
	}
	.state[data-level='unknown'] {
		color: var(--label-2);
	}
	.note {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 10px 16px 14px;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.low {
		color: var(--warning);
		font-weight: 600;
	}
</style>
