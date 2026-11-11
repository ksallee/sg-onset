<script lang="ts">
	// The early prototype notice, for outside testers: what SG OnSet is today, where the data
	// lives, that formats may change, and where feedback goes. On the first run it can be
	// dismissed (`ondismiss`); in About it always shows.
	import Button from '$lib/components/ios/Button.svelte';
	import { t } from '$lib/i18n/messages';

	let { ondismiss }: { ondismiss?: () => void } = $props();
	const FEEDBACK = 'https://github.com/ksallee/sg-onset/issues';
</script>

<section class="notice" aria-labelledby="prototype-title">
	<h2 id="prototype-title">{t('prototype.title')}</h2>
	<p>{t('prototype.body')}</p>
	<p>{t('prototype.feedback')} <a href={FEEDBACK} target="_blank" rel="noopener">{t('prototype.feedback.link')}</a></p>
	{#if ondismiss}
		<div class="dismiss">
			<Button variant="plain" size="large" onclick={ondismiss}>{t('prototype.dismiss')}</Button>
		</div>
	{/if}
</section>

<style>
	.notice {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 var(--page-margin, 16px) 32px;
		padding: 18px 16px 14px;
		border-radius: 24px;
		background: var(--group-bg, var(--cell));
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.notice:has(.dismiss) {
		padding-bottom: 6px;
	}
	h2 {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--tint);
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
</style>
