<script lang="ts">
	// The take before, read only (#52, Kevin's pick): the picked camera's values on the take number
	// before the one on screen, the fields the table shows, with their units as the table shows them.
	// A diamond marks a value the take on screen changed, as in the table. Nothing when there is no
	// take before on that camera. Beside the rail it fills the dock between the timing and the marks;
	// in a phone-width window it closes the take's column, under the photos.
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { beforeRows } from '$lib/take/before';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import { cameraName } from './labels';

	let { shoot }: { shoot: Shoot } = $props();
	const id = $props.id();

	const before = $derived(shoot.before);
	const col = $derived(shoot.columns.find((c) => c.id === shoot.setupId));
	const rows = $derived.by(() => {
		const b = before;
		if (!b) return [];
		const now = shoot.takeOf(shoot.setupId);
		return beforeRows(shoot.fields, b.take, shoot.lensOf(b.take, shoot.setupId), now, shoot.lensOf(now, shoot.setupId), settings.value.units);
	});
</script>

{#if before && col}
	<section class="take-before" aria-labelledby={id}>
		<h2>
			<span {id}>{t('take.before.title')}</span>
			<span class="what">{t('take.row', { take: before.number })} · {cameraName(col)}</span>
		</h2>
		<dl>
			{#each rows as row (row.key)}
				<div>
					<dt>{row.label}</dt>
					<dd class="num">
						{row.value}{#if row.changed}<span class="mark" aria-hidden="true"></span><span class="sr-only">, {t('take.cell.changed')}</span>{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</section>
{/if}

<style>
	.take-before {
		flex: none;
		padding: 12px 14px 14px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1.5px var(--separator);
	}
	h2 {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	h2 span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.what {
		flex: none;
		max-width: 60%;
		color: var(--label);
	}
	/* Two columns of label over value: five fields in three rows. */
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 12px;
		margin-top: 8px;
	}
	dl div {
		min-width: 0;
	}
	dt {
		font-size: 12px;
		line-height: 16px;
		font-weight: 600;
		color: var(--label-2);
	}
	dd {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-rounded);
		font-size: 18px;
		line-height: 23px;
		font-weight: 600;
		color: var(--label);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The table's diamond, the same size. */
	.mark {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 1px;
		background: var(--changed);
		transform: rotate(45deg);
	}
	:global([data-night='true']) dt,
	:global([data-night='true']) h2 {
		color: var(--label);
	}
</style>
