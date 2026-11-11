<script lang="ts">
	// The one line about the safety of the data (app/safety.ts). `float`: a quiet pill at the foot of
	// the page, clear of the side edges where the action rail is; the shell hides it on a focus page.
	// `inline`: in the sync detail. A warning has its own shape and weight, not only a colour.
	import { Info, TriangleAlert } from '@lucide/svelte';
	import { deviceOf, lineMessage, type Safety } from '$lib/app/safety';
	import { t, tk } from '$lib/i18n/messages';

	let { safety, variant, ondismiss, onnavigate }: { safety: Safety; variant: 'float' | 'inline'; ondismiss?: () => void; onnavigate?: () => void } = $props();

	const device = deviceOf(navigator);
	const message = $derived(lineMessage(safety, device));
	const text = $derived(message ? tk(message.key, { ...message.params, span: tk(message.span.key, message.span.params) }) : '');
	const warn = $derived(safety.level === 'warn');
</script>

{#if text}
	<div class="safety-line" data-variant={variant} data-level={safety.level} role={variant === 'float' ? 'status' : undefined}>
		{#if safety.level !== 'ok'}
			{#if warn}<TriangleAlert class="icon size-[20px]" strokeWidth={2.2} aria-hidden="true" />{:else}<Info class="icon size-[20px]" strokeWidth={1.8} aria-hidden="true" />{/if}
		{/if}
		<span class="text">{text}</span>
		{#if warn}
			<a href="/settings#backup" onclick={onnavigate}>{t('safety.backup')}</a>
		{:else if safety.dismissible && ondismiss}
			<button type="button" onclick={ondismiss}>{t('safety.dismiss')}</button>
		{/if}
	</div>
{/if}

<style>
	.safety-line {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--label-2);
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
	}
	.safety-line :global(.icon) {
		flex: none;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	/* Warning: full strength, bold, a triangle, and the warning colour on the triangle. */
	[data-level='warn'] {
		color: var(--label);
		font-weight: 600;
	}
	[data-level='warn'] :global(.icon) {
		color: var(--warning);
	}
	a,
	button {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: max(44px, var(--touch, 44px));
		padding: 0 14px;
		border-radius: 22px;
		color: var(--tint);
		font-weight: 600;
	}
	a:active,
	button:active {
		opacity: 0.6;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	[data-variant='float'] {
		position: absolute;
		z-index: 34;
		left: 50%;
		bottom: calc(16px + var(--safe-bottom));
		transform: translateX(-50%);
		width: max-content;
		max-width: min(560px, calc(100% - 32px));
		min-height: 48px;
		padding: 2px 4px 2px 14px;
		border-radius: 24px;
		background: var(--cell-elevated);
		box-shadow: var(--shadow-2);
	}
	[data-variant='float'][data-level='warn'] {
		outline: 1.5px solid var(--warning);
		outline-offset: -1.5px;
	}
	[data-variant='float'] .text {
		padding: 6px 0;
	}

	[data-variant='inline'] {
		margin: 4px 20px 0;
		padding: 6px 0;
	}
</style>
