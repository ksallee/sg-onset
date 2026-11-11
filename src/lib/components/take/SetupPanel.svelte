<script lang="ts">
	// The prototype's setup: holding hand, theme, gloves. A small panel by the Setup button. It
	// fades in (not the capture path); with reduced motion it just shows.
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import { t } from '$lib/i18n/messages';
	import { captureTarget } from '$lib/ios/target';
	import { layer } from '$lib/components/ios/layer.svelte';
	import { HANDS, THEMES, type Settings } from '$lib/take/settings';

	let {
		settings,
		at,
		onchange,
		onclose
	}: { settings: Settings; at: 'left' | 'right' | 'below'; onchange: (s: Settings) => void; onclose: () => void } = $props();

	const target = $derived(captureTarget(settings.gloves));
</script>

<button type="button" class="scrim" aria-label={t('settings.close')} onclick={onclose}></button>
<section class="setup-panel" data-at={at} use:layer={onclose} aria-label={t('settings.title')}>
	<h2>{t('settings.hand')}</h2>
	<Segmented label={t('settings.hand')} options={HANDS.map((h) => ({ value: h, label: t(`settings.hand.${h}`) }))} value={settings.hand} onchange={(v) => onchange({ ...settings, hand: v as Settings['hand'] })} />
	<h2>{t('settings.theme')}</h2>
	<Segmented label={t('settings.theme')} options={THEMES.map((th) => ({ value: th, label: t(`settings.theme.${th}`) }))} value={settings.theme} onchange={(v) => onchange({ ...settings, theme: v as Settings['theme'] })} />
	<h2>{t('settings.gloves')}</h2>
	<Segmented
		label={t('settings.gloves')}
		options={[
			{ value: 'off', label: t('settings.gloves.off') },
			{ value: 'on', label: t('settings.gloves.on') }
		]}
		value={settings.gloves ? 'on' : 'off'}
		onchange={(v) => onchange({ ...settings, gloves: v === 'on' })}
	/>
	<p class="num">{t('settings.targets', { mm: target.mm, px: target.size })}</p>
</section>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		cursor: default;
	}
	.setup-panel {
		position: absolute;
		z-index: 41;
		top: 12px;
		width: 280px;
		padding: 6px 14px 14px;
		border-radius: 20px;
		background: var(--cell-elevated);
		color: var(--label);
		box-shadow: 0 0 0 var(--hairline) var(--separator), 0 18px 48px rgb(0 0 0 / 0.35);
		transition: opacity 160ms ease-out, transform 160ms var(--ease-ios);
	}
	@starting-style {
		.setup-panel {
			opacity: 0;
			transform: scale(0.97);
		}
	}
	.setup-panel[data-at='right'] {
		right: calc(100% + 10px);
		transform-origin: top right;
	}
	.setup-panel[data-at='left'] {
		left: calc(100% + 10px);
		transform-origin: top left;
	}
	.setup-panel[data-at='below'] {
		top: calc(100% + 8px);
		right: 10px;
		transform-origin: top right;
	}
	h2 {
		margin: 12px 2px 6px;
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.setup-panel :global(.ios-seg) {
		height: 44px;
		border-radius: 12px;
	}
	.setup-panel :global(.ios-seg .thumb) {
		border-radius: 10px;
	}
	.setup-panel :global(.ios-seg button) {
		font-size: 16px;
	}
	p {
		margin: 12px 2px 0;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	@media (prefers-reduced-motion: reduce) {
		.setup-panel {
			transition: none;
		}
	}
</style>
