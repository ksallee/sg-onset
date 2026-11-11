<script lang="ts">
	// How to add the app to the Home Screen on iPadOS and iOS: the two taps, each with the glyph
	// Safari shows. `ios-open-in-safari`: an in-app browser cannot install, so it says to open
	// Safari first.
	import { Share, SquarePlus } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';

	let { how }: { how: 'ios-share' | 'ios-open-in-safari' } = $props();
</script>

{#if how === 'ios-open-in-safari'}
	<p class="plain">{t('install.inApp')}</p>
{:else}
	<ol class="steps">
		<li>
			<span class="glyph" aria-hidden="true"><Share class="size-[20px]" strokeWidth={2} /></span>
			<span>{t('install.step.share')}</span>
		</li>
		<li>
			<span class="glyph" aria-hidden="true"><SquarePlus class="size-[20px]" strokeWidth={2} /></span>
			<span>{t('install.step.add')}</span>
		</li>
	</ol>
{/if}

<style>
	.steps {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label);
		counter-increment: step;
	}
	li::before {
		content: counter(step);
		flex: none;
		width: 14px;
		font-size: 15px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--label-2);
	}
	.glyph {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		background: var(--fill-3);
		color: var(--tint);
	}
	.plain {
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label);
	}
</style>
