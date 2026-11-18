<script lang="ts">
	// The take on screen: what is read at arm's length first, the slate (with its scene under it)
	// and the take number, then where the take stands and what it is for; the numbers of every
	// camera (CameraTable); the photos on it. The take number never shrinks or cuts; a long slate
	// wraps to a second line. The elapsed time shows here only while the dock's timing does not
	// (`time`, or a short phone-width window): once on the screen. With no camera setup yet, a line says where to add them.
	import { Camera } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { Form } from '$lib/ios/handedness';
	import { elapsedMs, formatElapsed } from '$lib/take/record';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import { typeWords } from '$lib/take/typeText';
	import CameraTable from './CameraTable.svelte';
	import { feedback, SETTLE } from './feedback.svelte';
	import PhotoStrip from './PhotoStrip.svelte';

	let { shoot, form, time = false }: { shoot: Shoot; form: Form; time?: boolean } = $props();
	const slate = $derived(shoot.slate);
	const number = $derived(shoot.group?.number ?? '–');
	const elapsed = $derived(formatElapsed(elapsedMs({ start: shoot.times.start, end: shoot.times.end }, shoot.now)));
	const typed = $derived(typeWords(shoot.type, shoot.tail).join(', '));
</script>

<div class="take-detail" data-form={form}>
	<!-- The page's name for assistive tech; the screen shows the parts below. -->
	<h1 class="sr-only">{t('shoot.heading', { slate: slate?.slateUID ?? '' })}</h1>
	<header>
		<div class="slate">
			<span class="label">{t('take.slate')}</span>
			<span class="uid num">{slate?.slateUID ?? ''}</span>
			{#if slate?.sceneNumber}<span class="scene">{t('take.scene.line', { scene: slate.sceneNumber })}</span>{/if}
		</div>
		<div class="take">
			<span class="label">{t('take.take')}</span>
			<span class="n num" {@attach feedback(() => shoot.group?.number, SETTLE)}>{number}</span>
		</div>
		<div class="status">
			<p class="phase {shoot.phase}" role="status">
				<span class="shape" aria-hidden="true"></span>
				<span class="word">{t(`phase.${shoot.phase}`)}</span>
				{#if shoot.phase !== 'idle'}<span class="time num" class:shown={time}>{elapsed}</span>{/if}
			</p>
			{#if typed}<p class="type">{typed}</p>{/if}
		</div>
	</header>

	{#if !shoot.setups.value.length && shoot.setups.ready}
		<p class="nosetups">
			<Camera class="size-5" strokeWidth={2} aria-hidden="true" />
			<span><strong>{t('take.noSetups')}</strong> {t('take.noSetups.message')} <a href="/gear">{t('take.noSetups.action')}</a></span>
		</p>
	{:else if shoot.setups.ready && shoot.chosen.size === 0}
		<!-- #110: every setup is in Gear on every device; this one shoots with none of them yet. -->
		<p class="nosetups">
			<Camera class="size-5" strokeWidth={2} aria-hidden="true" />
			<span><strong>{t('take.noChosen')}</strong> {t('take.noChosen.message')} <a href="/gear">{t('take.noSetups.action')}</a></span>
		</p>
	{/if}

	{#if shoot.group}
		<CameraTable {shoot} />
		<button type="button" class="more" aria-pressed={shoot.showAll} onclick={() => (shoot.showAll = !shoot.showAll)}>
			{shoot.showAll ? t('take.fields.fewer') : t('take.fields.all')}
		</button>
		<PhotoStrip {shoot} grid={form !== 'compact'} />
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
	/* Slate and take side by side, the take on the outer edge; the state and the type under them. */
	header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		column-gap: 16px;
		row-gap: 10px;
	}
	.slate,
	.take {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.take {
		align-items: flex-end;
	}
	.label {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.uid {
		font-family: var(--font-rounded);
		font-size: 30px;
		line-height: 34px;
		font-weight: 700;
		letter-spacing: -0.3px;
		/* A long slate wraps, by the character if it must, on two lines at most. */
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.scene {
		margin-top: 2px;
		font-size: 15px;
		line-height: 20px;
		font-weight: 600;
		color: var(--label-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The take number: the biggest thing on the screen, never cut. */
	.n {
		font-family: var(--font-rounded);
		font-size: clamp(52px, 16cqw, 72px);
		line-height: 0.95;
		font-weight: 700;
		letter-spacing: -1px;
		white-space: nowrap;
	}
	.status {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		min-width: 0;
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
		display: none;
		font-family: var(--font-rounded);
		font-size: 22px;
		font-weight: 700;
	}
	/* Here while the dock's timing is off screen: the keypad is up, or a short phone-width window
	   has no room for the timing band (TakeTray). */
	.time.shown {
		display: inline;
	}
	@media (max-height: 560px) {
		[data-form='compact'] .time {
			display: inline;
		}
	}
	/* What the take is for, when it is not Main, and the plates at its tail. */
	.type {
		min-width: 0;
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		color: var(--label);
		overflow-wrap: anywhere;
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
		header {
			row-gap: 8px;
		}
		.uid {
			font-size: 26px;
			line-height: 30px;
		}
		.phase {
			height: 40px;
			padding: 0 12px;
		}
		.type {
			font-size: 15px;
			line-height: 20px;
		}
	}
</style>
