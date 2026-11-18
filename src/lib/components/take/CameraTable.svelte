<script lang="ts">
	// The take's numbers for every camera at once: one column per camera setup (letter, camera,
	// lens), one row per number, its unit once beside its label. The column picked is the one the
	// dock types into and a photo goes on. Every number that can be typed sits in a well: tap it to
	// pick its camera and put it in the keypad. A prime's focal length comes from the lens: no well,
	// a small lock in the corner, not typed. A small diamond marks a number that changed since the
	// take before. A value that changed over the take shows its end under it. More cameras than fit
	// scroll sideways; the picked one is kept in view. A value just stored, the field the keypad
	// moves to and the camera just picked each answer with a little motion (feedback.svelte.ts).
	import { Lock, Plus } from '@lucide/svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { radioStep } from '$lib/ios/keys';
	import { slotKey } from '$lib/take/fields';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import { feedback, PICKED, STORED } from './feedback.svelte';
	import { cameraName, cellLabel, shortLabel, spoken, unitText } from './labels';

	let { shoot }: { shoot: Shoot } = $props();

	const units = $derived(settings.value.units);

	let el = $state<HTMLElement | null>(null);
	let cams = $state<HTMLElement | null>(null);
	function key(e: KeyboardEvent, i: number) {
		const to = radioStep(e.key, i, shoot.columns.map(() => true));
		if (to === null) return;
		e.preventDefault();
		el?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
		shoot.pick(shoot.columns[to].id);
	}
	/** The count of the value just stored, for the cell that holds it; null for every other. */
	const storedHere = (setupId: string, fieldKey: string) => {
		const s = shoot.saved;
		return s && s.setupId === setupId && (s.key === slotKey(fieldKey, false) || s.key === slotKey(fieldKey, true)) ? s.n : null;
	};

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
			{@const name = cameraName(col)}
			{@const gone = !col.label && !!col.id}
			<div class="cam" class:on class:off={!take}>
				<button
					type="button"
					class="head"
					role="radio"
					aria-checked={on}
					aria-label={[name, body, lens?.lensModel].filter(Boolean).join(', ')}
					tabindex={on ? 0 : -1}
					onclick={() => shoot.pick(col.id)}
					onkeydown={(e) => key(e, i)}
				>
					<span class="letter" {@attach feedback(() => (on ? col.id : null), PICKED)}>{col.label || '–'}</span>
					<span class="what">
						{#if gone}<span class="body gone">{t('take.setup.gone.short')}</span>{:else}<span class="body">{body || '–'}</span>{/if}
						<span class="lens">{lens?.lensModel ?? ''}</span>
					</span>
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
						{@const changed = shoot.changed(col.id, def)}
						{@const say = { camera: name, field: shortLabel(def), value: spoken(value, def, units) }}
						{#if shoot.locked(col.id, def)}
							<div class="cell num locked" role="img" aria-label={cellLabel({ ...say, locked: true })}>
								<span class="lock" aria-hidden="true"><Lock class="size-3" strokeWidth={2.6} /></span><span class="n">{value}</span>
							</div>
						{:else}
							<button
								type="button"
								class="cell num"
								class:active
								aria-pressed={active}
								aria-label={cellLabel({ ...say, changed, end: end ? { field: shortLabel(def, true), value: spoken(end, def, units) } : undefined })}
								onclick={() => shoot.open(col.id, def, active ? shoot.field!.end : false)}
								{@attach feedback(() => (active ? `${def.key}${shoot.field?.end}` : null), PICKED)}
							>
								{#if changed}<span class="mark" aria-hidden="true"></span>{/if}
								<span class="n" class:empty={!value} class:small={!!end} {@attach feedback(() => storedHere(col.id, def.key), STORED)}>{value || '–'}</span>
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
		/* A row is a touch target: taller at the large button size. */
		--row: max(60px, calc(var(--touch, 44px) + 8px));
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
		background: var(--fill-4);
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
	/* The unit once per row, under its label. */
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
		font-size: 14px;
		line-height: 17px;
		font-weight: 600;
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
		max-width: 100%;
		height: 30px;
		padding: 0 6px;
		border-radius: 9px;
		background: var(--fill-2);
		font-family: var(--font-rounded);
		font-size: 20px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.body.gone {
		color: var(--warning);
	}
	.lens {
		font-size: 12px;
		line-height: 15px;
		color: var(--label-2);
	}
	/* Every number that can be typed sits in a well; the picked camera's are full strength. */
	.cam .cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: var(--row);
		border-radius: 14px;
		background: var(--fill-3);
		color: var(--label-2);
		font-family: var(--font-rounded);
	}
	.cam.on .cell {
		color: var(--label);
	}
	/* From the lens: no well, the lock small in the corner, the number where the others are. */
	.cam .cell.locked {
		background: transparent;
		color: var(--label-2);
	}
	.lock {
		position: absolute;
		top: 6px;
		left: 7px;
		display: flex;
		color: var(--label-3);
	}
	button.cell:active {
		background: var(--press);
	}
	.cam .cell.active {
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
	/* Changed since the take before: a small diamond in the corner, clear of the number. */
	.mark {
		position: absolute;
		top: 7px;
		right: 7px;
		width: 6px;
		height: 6px;
		border-radius: 1px;
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
			--row: max(54px, var(--touch, 44px));
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
