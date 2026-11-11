<script lang="ts">
	// The take's numbers for every camera at once: one column per camera setup (letter, camera,
	// lens), one row per number. The column picked is the one the dock types into and a photo goes
	// on. Tapping a number picks its camera and puts it in the keypad. A prime's focal length comes
	// from the lens: shown with a lock, not typed. A diamond marks a number that changed since the
	// take before. A value that changed over the take shows its end under it. More cameras than fit
	// scroll sideways; the picked one is kept in view.
	import { Lock, Plus } from '@lucide/svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { radioStep } from '$lib/ios/keys';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import { shortLabel, spoken, unitText } from './labels';

	let { shoot }: { shoot: Shoot } = $props();

	const units = $derived(settings.value.units);
	const camName = (label: string) => (label ? t('take.setup', { id: label }) : t('take.setup.none'));

	let el = $state<HTMLElement | null>(null);
	let cams = $state<HTMLElement | null>(null);
	function key(e: KeyboardEvent, i: number) {
		const to = radioStep(e.key, i, shoot.columns.map(() => true));
		if (to === null) return;
		e.preventDefault();
		el?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
		shoot.pick(shoot.columns[to].id);
	}

	// The picked camera and the number in the keypad stay in view, moved only when out of it.
	$effect(() => {
		void shoot.setupId;
		void shoot.field;
		const box = cams;
		if (!box) return;
		const on = box.querySelector<HTMLElement>('.cam.on');
		if (on) {
			const l = on.offsetLeft - box.offsetLeft;
			if (l < box.scrollLeft) box.scrollLeft = l;
			else if (l + on.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = l + on.offsetWidth - box.clientWidth;
		}
		const active = box.querySelector<HTMLElement>('.active');
		const scroller = el?.closest<HTMLElement>('.main');
		if (active && scroller) {
			const r = active.getBoundingClientRect();
			const s = scroller.getBoundingClientRect();
			if (r.top < s.top) scroller.scrollTop -= s.top - r.top + 8;
			else if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom + 8;
		}
	});
</script>

<div class="camera-table" bind:this={el} data-count={shoot.columns.length}>
	<div class="labels" aria-hidden="true">
		<div class="head"></div>
		{#each shoot.fields as def (def.key)}
			<div class="cell"><span class="name">{shortLabel(def)}</span><span class="unit">{unitText(def, units)}</span></div>
		{/each}
	</div>
	<div class="cams" role="radiogroup" aria-label={t('take.cameras')} bind:this={cams}>
		{#each shoot.columns as col, i (col.id)}
			{@const take = shoot.takeOf(col.id)}
			{@const on = col.id === shoot.setupId}
			{@const lens = shoot.lensOf(take, col.id)}
			{@const body = shoot.cameraName(take, col.id)}
			<div class="cam" class:on class:off={!take}>
				<button
					type="button"
					class="head"
					role="radio"
					aria-checked={on}
					aria-label={[camName(col.label), body, lens?.lensModel].filter(Boolean).join(', ')}
					tabindex={on ? 0 : -1}
					onclick={() => shoot.pick(col.id)}
					onkeydown={(e) => key(e, i)}
				>
					<span class="letter">{col.label || '–'}</span>
					<span class="what"><span class="body">{body || '–'}</span><span class="lens">{lens?.lensModel ?? ''}</span></span>
				</button>
				{#if !take}
					{#if shoot.group && col.setup}
						<button type="button" class="add" aria-label={t('take.camera.addLabel', { id: col.label, take: shoot.group.number })} onclick={() => shoot.addCamera(col.id)}>
							<Plus class="size-5" strokeWidth={2.4} />{t('take.camera.add')}
						</button>
					{/if}
					<p class="offtake">{t('take.camera.off')}</p>
				{:else}
					{#each shoot.fields as def (def.key)}
						{@const value = shoot.shown(col.id, def)}
						{@const end = def.end ? shoot.shown(col.id, def, true) : ''}
						{@const active = on && shoot.field?.def.key === def.key}
						{#if shoot.locked(col.id, def)}
							<div class="cell num locked" role="img" aria-label={t('take.cell.locked', { camera: camName(col.label), field: shortLabel(def), value: spoken(value, def, units) })}>
								<Lock class="size-3.5" strokeWidth={2.4} /><span class="n">{value}</span>
							</div>
						{:else}
							<button
								type="button"
								class="cell num"
								class:active
								aria-pressed={active}
								aria-label={t('take.cell', { camera: camName(col.label), field: shortLabel(def), value: spoken(value, def, units) }) + (end ? `, ${shortLabel(def, true)} ${spoken(end, def, units)}` : '')}
								onclick={() => shoot.open(col.id, def, active ? shoot.field!.end : false)}
							>
								{#if shoot.changed(col.id, def)}<span class="mark" title={t('take.changed')}></span>{/if}
								<span class="n" class:empty={!value} class:small={!!end}>{value || '–'}</span>
								{#if end}<span class="end">→ {end}</span>{/if}
							</button>
						{/if}
					{/each}
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.camera-table {
		--row: 60px;
		--head: 76px;
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr);
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
		grid-auto-flow: column;
		grid-auto-columns: minmax(108px, 1fr);
		gap: 6px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		scroll-snap-type: x proximity;
	}
	.cams::-webkit-scrollbar {
		display: none;
	}
	/* One camera: one column, as wide as a column of three would be. */
	[data-count='1'] .cams {
		grid-auto-columns: minmax(140px, 260px);
	}
	.cam {
		padding: 4px;
		border-radius: 20px;
		background: var(--fill-3);
		scroll-snap-align: start;
	}
	.cam.on {
		background: var(--cell-elevated);
		box-shadow: inset 0 0 0 2px var(--label);
	}
	.cam.off {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--separator);
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
		white-space: nowrap;
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
		min-width: 34px;
		height: 30px;
		padding: 0 6px;
		border-radius: 9px;
		background: var(--fill-2);
		font-family: var(--font-rounded);
		font-size: 20px;
		font-weight: 700;
	}
	.on .letter {
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		box-shadow: inset 0 0 0 var(--state-ring) var(--on-tint-solid);
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
		flex-direction: column;
		align-items: center;
		justify-content: center;
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
		flex-direction: row;
		gap: 5px;
		background: transparent;
		color: var(--label-2);
	}
	button.cell:active {
		background: var(--press);
	}
	.cam.on .cell.active {
		background: var(--tint-fill);
		box-shadow: inset 0 0 0 2.5px var(--tint);
	}
	.n {
		font-size: 24px;
		line-height: 28px;
		font-weight: 600;
		letter-spacing: -0.3px;
		white-space: nowrap;
	}
	.n.small {
		font-size: 20px;
		line-height: 23px;
	}
	.cam.on .n {
		font-weight: 700;
	}
	.n.empty {
		color: var(--label-3);
	}
	.end {
		font-size: 13px;
		line-height: 16px;
		font-weight: 600;
		color: var(--label-2);
		white-space: nowrap;
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
	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: var(--row);
		border-radius: 14px;
		background: var(--fill-3);
		color: var(--tint);
		font-size: 16px;
		font-weight: 600;
	}
	.add:active {
		background: var(--press);
	}
	.offtake {
		padding: 8px 6px;
		text-align: center;
		font-size: 13px;
		line-height: 17px;
		color: var(--label-2);
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	@container (max-width: 420px) {
		.camera-table {
			--head: 58px;
			--row: 54px;
			grid-template-columns: 64px minmax(0, 1fr);
			gap: 4px;
		}
		.cams {
			gap: 4px;
			grid-auto-columns: minmax(92px, 1fr);
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
