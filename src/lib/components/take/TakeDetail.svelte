<script lang="ts">
	// The take on screen: slate, take and where it stands; the numbers of every camera
	// (CameraTable); the photos on it. In a phone-width window the marks sit here too: the dock is
	// the keypad's there. With no camera setup yet, a line says where to add them.
	import { Camera } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { Form } from '$lib/ios/handedness';
	import { elapsedMs, formatElapsed } from '$lib/take/record';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import CameraTable from './CameraTable.svelte';
	import MarkBar from './MarkBar.svelte';
	import PhotoStrip from './PhotoStrip.svelte';

	let { shoot, form, onnote }: { shoot: Shoot; form: Form; onnote: () => void } = $props();
	const slate = $derived(shoot.slate);
	const elapsed = $derived(formatElapsed(elapsedMs({ start: shoot.times.start, end: shoot.times.end }, shoot.now)));
</script>

<div class="take-detail">
	<!-- The page's name for assistive tech; the screen shows the parts below. -->
	<h1 class="sr-only">{t('shoot.heading', { slate: slate?.slateUID ?? '' })}</h1>
	<header>
		<dl class="ident">
			{#if slate?.sceneNumber}<div><dt>{t('take.scene')}</dt><dd class="num">{slate.sceneNumber}</dd></div>{/if}
			<div><dt>{t('take.slate')}</dt><dd class="num">{slate?.slateUID ?? ''}</dd></div>
			<div class="big"><dt>{t('take.take')}</dt><dd class="num">{shoot.group?.number ?? '–'}</dd></div>
		</dl>
		<p class="phase {shoot.phase}" role="status">
			<span class="shape" aria-hidden="true"></span>
			<span class="word">{t(`phase.${shoot.phase}`)}</span>
			{#if shoot.phase !== 'idle'}<span class="time num">{elapsed}</span>{/if}
		</p>
	</header>

	{#if form === 'compact'}<MarkBar {shoot} {onnote} compact />{/if}

	{#if !shoot.setups.value.length && shoot.setups.ready}
		<p class="nosetups">
			<Camera class="size-5" strokeWidth={2} aria-hidden="true" />
			<span><strong>{t('take.noSetups')}</strong> {t('take.noSetups.message')} <a href="/gear">{t('take.noSetups.action')}</a></span>
		</p>
	{/if}

	{#if shoot.group}
		<CameraTable {shoot} />
		<button type="button" class="more" aria-pressed={shoot.showAll} onclick={() => (shoot.showAll = !shoot.showAll)}>
			{shoot.showAll ? t('take.fields.fewer') : t('take.fields.all')}
		</button>
		<PhotoStrip {shoot} />
	{:else}
		<p class="none">{t('take.none')}</p>
	{/if}
</div>

<style>
	.take-detail {
		flex: none;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px 16px 20px;
	}
	header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		min-height: 78px;
	}
	.ident {
		display: flex;
		align-items: flex-end;
		gap: 22px;
		min-width: 0;
	}
	.ident div {
		min-width: 0;
	}
	dt {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	dd {
		font-family: var(--font-rounded);
		font-size: 28px;
		line-height: 34px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.big dd {
		font-size: 56px;
		line-height: 56px;
		letter-spacing: -1px;
	}
	.phase {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 14px;
		border-radius: 14px;
		background: var(--fill-3);
		font-size: 17px;
		font-weight: 600;
		white-space: nowrap;
	}
	/* The shape says the state without colour: a ring ready, a square running, a bar ended. */
	.shape {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2.5px solid var(--label-2);
	}
	.rolling .shape {
		border: 0;
		border-radius: 3px;
		background: currentColor;
	}
	.filed .shape {
		height: 4px;
		border: 0;
		border-radius: 2px;
		background: var(--label-2);
	}
	.phase.rolling {
		background: var(--record);
		color: var(--on-record);
	}
	:global([data-night='true']) .phase.rolling {
		background: transparent;
		box-shadow: inset 0 0 0 2.5px var(--record);
		color: var(--record);
	}
	.time {
		font-family: var(--font-rounded);
		font-size: 22px;
		font-weight: 700;
	}
	.nosetups {
		display: flex;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--fill-3);
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
	.nosetups :global(svg) {
		flex: none;
		margin-top: 1px;
	}
	.nosetups strong {
		color: var(--label);
	}
	.nosetups a {
		color: var(--tint);
		font-weight: 600;
	}
	.more {
		align-self: flex-start;
		min-height: var(--touch, 44px);
		padding: 0 14px;
		margin-top: -6px;
		border-radius: 12px;
		color: var(--tint);
		font-size: 16px;
		font-weight: 600;
	}
	.more:active {
		background: var(--press);
	}
	.none {
		padding: 24px 0;
		font-size: 17px;
		line-height: 22px;
		color: var(--label-2);
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	@container (max-width: 400px) {
		.ident {
			gap: 14px;
		}
		.big dd {
			font-size: 44px;
			line-height: 46px;
		}
		.phase {
			padding: 0 10px;
		}
	}
</style>
