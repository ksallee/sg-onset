<script lang="ts">
	// The take's numbers for every camera at once: one column per setup (letter, body, lens), one
	// row per number. The column picked is the one the dock edits. Tapping a number picks its
	// camera and puts it in the keypad. A prime's focal length comes from the lens: shown with a
	// lock, not typed. A diamond marks a number that differs from the take before.
	import { Lock } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import { radioStep } from '$lib/ios/keys';
	import { FIELDS, fieldEditable, specFor } from '$lib/take/fields';
	import type { TakeScreen } from '$lib/take/screen.svelte';
	import { changedFrom } from '$lib/take/session';
	import { SETUP_IDS } from '$lib/take/types';

	let { screen }: { screen: TakeScreen } = $props();

	const changed = $derived(Object.fromEntries(SETUP_IDS.map((id) => [id, changedFrom(screen.take, screen.before, id)])));

	let el = $state<HTMLElement | null>(null);
	function key(e: KeyboardEvent, i: number) {
		const to = radioStep(e.key, i, SETUP_IDS.map(() => true));
		if (to === null) return;
		e.preventDefault();
		el?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
		screen.pickSetup(SETUP_IDS[to]);
	}

	// The number in the keypad stays in view (a phone-width window is short once the keypad is up).
	$effect(() => {
		if (screen.field) el?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="camera-table" bind:this={el}>
	<div class="labels" aria-hidden="true">
		<div class="head"></div>
		{#each FIELDS as f (f.key)}
			<div class="cell"><span class="name">{t(f.label)}</span>{#if !f.unitFirst}<span class="unit">{t(f.unit)}</span>{/if}</div>
		{/each}
	</div>
	<div class="cams" role="radiogroup" aria-label={t('take.cameras')}>
		{#each SETUP_IDS as id, i (id)}
			{@const setup = screen.setups[id]}
			{@const on = id === screen.setup}
			<div class="cam" class:on>
				<button type="button" class="head" role="radio" aria-checked={on} aria-label="{t('take.setup', { id })}, {setup.body}, {setup.lens.name}" tabindex={on ? 0 : -1} onclick={() => screen.pickSetup(id)} onkeydown={(e) => key(e, i)}>
					<span class="letter">{id}</span>
					<span class="what"><span class="body">{setup.body}</span><span class="lens">{setup.lens.name}</span></span>
				</button>
				{#each FIELDS as f (f.key)}
					{@const value = screen.shownFor(id, f.key)}
					{@const active = on && screen.field === f.key}
					{#if fieldEditable(f.key, setup.lens)}
						<button type="button" class="cell num" class:active aria-pressed={active} aria-label="{t('take.setup', { id })}, {t(f.label)}, {value || t('take.empty')} {t(specFor(f.key, setup.lens).unit)}" onclick={() => screen.openCell(id, f.key)}>
							{#if changed[id].includes(f.key)}<span class="mark" aria-hidden="true"></span>{/if}
							<span class="n" class:empty={!value}>{value || '–'}</span>
							{#if active}<span class="caret" aria-hidden="true"></span>{/if}
						</button>
					{:else}
						<div class="cell num locked" title={t('take.fromLens')}><Lock class="size-3.5" strokeWidth={2.4} aria-label={t('take.fromLens')} /><span class="n">{value}</span></div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.camera-table {
		--row: 60px;
		--head: 76px;
		display: grid;
		grid-template-columns: minmax(84px, 0.8fr) minmax(0, 3.3fr);
		gap: 6px;
	}
	.labels,
	.cam {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.cams {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
	}
	.cam {
		padding: 4px;
		border-radius: 20px;
		background: var(--fill-3);
	}
	.cam.on {
		background: var(--cell-elevated);
		box-shadow: inset 0 0 0 2px var(--label);
	}
	.labels {
		padding: 4px 0;
	}
	.head {
		height: var(--head);
	}
	.labels .cell {
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: var(--row);
		padding-left: 2px;
	}
	.name {
		font-size: 15px;
		line-height: 19px;
		font-weight: 600;
		letter-spacing: -0.23px;
	}
	.labels .unit {
		font-size: 12px;
		line-height: 15px;
		color: var(--label-2);
	}
	button.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		min-width: 0;
		border-radius: 16px;
		color: var(--label);
	}
	button.head:active {
		background: var(--press);
	}
	.letter {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 30px;
		border-radius: 9px;
		background: var(--fill-2);
		font-family: var(--font-rounded);
		font-size: 20px;
		font-weight: 700;
	}
	.on .letter {
		background: var(--label);
		color: var(--bg);
	}
	.what {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-width: 100%;
	}
	.body,
	.lens {
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.body {
		font-size: 13px;
		line-height: 16px;
		font-weight: 600;
	}
	.lens {
		font-size: 12px;
		line-height: 15px;
		color: var(--label-2);
	}
	.cam .cell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: var(--row);
		border-radius: 14px;
		color: var(--label-2);
		font-family: var(--font-rounded);
	}
	.cam.on .cell {
		color: var(--label);
		background: var(--fill-3);
	}
	.cam .cell.locked,
	.cam.on .cell.locked {
		background: transparent;
		color: var(--label-2);
	}
	button.cell:active {
		background: var(--press);
	}
	.cam.on .cell.active {
		background: color-mix(in srgb, var(--tint) 18%, var(--cell));
		box-shadow: inset 0 0 0 2.5px var(--tint);
	}
	.n {
		font-size: 24px;
		font-weight: 600;
		letter-spacing: -0.3px;
	}
	.cam.on .n {
		font-weight: 700;
	}
	.n.empty {
		color: var(--label-3);
	}
	.mark {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--changed);
		transform: rotate(45deg);
	}
	/* A still caret: where the keypad types. It does not blink. */
	.caret {
		width: 3px;
		height: 26px;
		margin-left: -2px;
		border-radius: 2px;
		background: var(--tint);
	}
	button:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 1px;
	}
	@container (max-width: 400px) {
		.camera-table {
			--head: 58px;
			--row: 54px;
			grid-template-columns: 76px minmax(0, 1fr);
			gap: 4px;
		}
		.cams {
			gap: 4px;
		}
		.lens {
			display: none;
		}
		.n {
			font-size: 21px;
		}
		.name {
			font-size: 14px;
		}
	}
</style>
