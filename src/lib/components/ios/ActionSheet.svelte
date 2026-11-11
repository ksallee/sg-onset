<script lang="ts">
	// An action sheet, in place of confirm(): a title and message, the actions, Cancel apart below.
	// An action with role 'cancel' becomes the Cancel button; without one, Cancel is added. Closes on
	// any action, the scrim or Escape. Focus moves in and stays (keys.ts trapStep).
	// Motion (docs/design/motion.md): a tap brings it up on the page spring, as transitions, so a
	// tap mid-way turns it around from where it is. It leaves sooner than it came and takes no
	// touch while it does. Reduced motion: it fades.
	import { onDestroy } from 'svelte';
	import { getScreen, holdFocus, overlays, portal, reducedMotion, trapTab } from './layer.svelte';
	import { t } from '$lib/i18n/messages';
	import { DURATIONS } from '$lib/theme/motion';

	type Action = { label: string; role?: 'destructive' | 'cancel'; run: () => void };
	let { open = $bindable(false), title, message, actions }: { open?: boolean; title?: string; message?: string; actions: Action[] } = $props();

	const screen = getScreen();
	const cancel = $derived(actions.find((a) => a.role === 'cancel') ?? { label: t('common.cancel'), role: 'cancel' as const, run: () => {} });
	const main = $derived(actions.filter((a) => a.role !== 'cancel'));

	let phase = $state<'closed' | 'entering' | 'open' | 'leaving'>('closed');
	let el = $state<HTMLElement | null>(null);
	let id = 0;
	let release: (() => void) | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let reduced = $state(false);

	$effect(() => {
		if (open && (phase === 'closed' || phase === 'leaving')) {
			clearTimeout(timer);
			if (phase === 'closed') {
				id = overlays.open();
				reduced = reducedMotion();
			}
			phase = 'entering';
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (phase !== 'entering') return;
					phase = 'open';
					if (el && !release) release = holdFocus(el);
				})
			);
		} else if (!open && (phase === 'open' || phase === 'entering')) {
			phase = 'leaving';
			timer = setTimeout(
				() => {
					phase = 'closed';
					overlays.close(id);
					release?.();
					release = null;
				},
				reduced ? DURATIONS.fade : DURATIONS.exit
			);
		}
	});
	onDestroy(() => {
		clearTimeout(timer);
		if (id) overlays.close(id);
	});

	function pick(a: Action) {
		open = false;
		a.run();
	}
	function key(e: KeyboardEvent) {
		if (phase !== 'open' || !el || !overlays.top(id)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			pick(cancel);
		} else if (e.key === 'Tab') trapTab(e, el);
	}
</script>

<svelte:window onkeydown={key} />

{#if phase !== 'closed'}
	<div class="ios-action-layer" class:shown={phase === 'open'} class:leaving={phase === 'leaving'} class:reduced {@attach portal(() => screen?.el)}>
		<button class="scrim" aria-label={t('common.cancel')} tabindex="-1" onclick={() => pick(cancel)}></button>
		<div class="sheet" role="dialog" aria-modal="true" aria-label={title ?? t('kit.actions')} tabindex="-1" bind:this={el}>
			<div class="group">
				{#if title || message}
					<div class="info">
						{#if title}<p class="title">{title}</p>{/if}
						{#if message}<p class="message">{message}</p>{/if}
					</div>
				{/if}
				{#each main as a (a.label)}
					<button type="button" class="act" class:red={a.role === 'destructive'} onclick={() => pick(a)}>{a.label}</button>
				{/each}
			</div>
			<div class="group">
				<button type="button" class="act cancel" onclick={() => pick(cancel)}>{cancel.label}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.ios-action-layer {
		position: fixed;
		z-index: 50;
		inset: 0;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: var(--scrim);
		opacity: 0;
		transition: opacity var(--dur-exit) var(--ease-out);
		border: 0;
	}
	/* On its way out it takes no touch: what is under it answers at once. */
	.leaving {
		pointer-events: none;
	}
	.sheet {
		position: absolute;
		/* A 414 px column at most; the scrim dims everything. */
		left: max(8px, calc(50% - 207px));
		right: max(8px, calc(50% - 207px));
		bottom: calc(8px + var(--safe-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
		transform: translateY(calc(100% + 20px));
		transition: transform var(--dur-exit) var(--ease-out);
		outline: none;
	}
	.shown .scrim {
		opacity: 1;
		transition: opacity var(--dur-page) var(--ease-out);
	}
	.shown .sheet {
		transform: none;
		transition: transform var(--dur-page) var(--spring-page);
	}
	.reduced .scrim,
	.reduced .sheet {
		transition: opacity var(--dur-fade) linear !important;
	}
	.reduced .sheet {
		transform: none;
		opacity: 0;
	}
	.reduced.shown .sheet {
		opacity: 1;
	}
	.group {
		border-radius: 14px;
		overflow: hidden;
		background: var(--mat-bar);
		-webkit-backdrop-filter: var(--mat-blur);
		backdrop-filter: var(--mat-blur);
	}
	.info {
		padding: 14px 16px;
		text-align: center;
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.title {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		color: var(--label-2);
	}
	.message {
		margin-top: 2px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
	.act {
		display: block;
		width: 100%;
		height: 57px;
		font-size: 20px;
		letter-spacing: -0.45px;
		color: var(--tint);
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		transition: background-color var(--dur-press);
	}
	.act:last-child {
		box-shadow: none;
	}
	.act:active {
		background: var(--fill-3);
		transition: none;
	}
	.act.red {
		color: var(--destructive);
	}
	.act.cancel {
		font-weight: 600;
		background: var(--cell-elevated);
	}
	.act:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
</style>
