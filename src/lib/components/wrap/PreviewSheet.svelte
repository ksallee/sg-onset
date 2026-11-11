<script lang="ts">
	// The first rows of a table file, in a sheet. Scrolls sideways: the camera report is wide.
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { t } from '$lib/i18n/messages';
	import type { Preview } from '$lib/wrap/preview';

	let { open = $bindable(false), title, preview }: { open?: boolean; title: string; preview: Preview | null } = $props();
</script>

<Sheet bind:open title={t('wrap.preview.title', { file: title })} done>
	{#if preview}
		<p class="count">{preview.total ? t('wrap.preview.rows', { shown: preview.rows.length, total: preview.total }) : t('wrap.preview.empty')}</p>
		<div class="scroll" role="region" aria-label={t('wrap.preview.title', { file: title })} tabindex="-1">
			<table>
				<thead>
					<tr>{#each preview.header as h, i (i)}<th scope="col">{h}</th>{/each}</tr>
				</thead>
				<tbody>
					{#each preview.rows as row, r (r)}
						<tr>{#each row as cell, i (i)}<td>{cell}</td>{/each}</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Sheet>

<style>
	.count {
		margin: 4px 16px 10px;
		font-size: 13px;
		color: var(--label-2);
	}
	.scroll {
		overflow: auto;
		margin: 0 16px 24px;
		border-radius: 12px;
		background: var(--cell-elevated);
		max-height: 70vh;
	}
	table {
		border-collapse: collapse;
		font-size: 13px;
		line-height: 18px;
		font-variant-numeric: tabular-nums;
	}
	th {
		position: sticky;
		top: 0;
		background: var(--cell-elevated);
		text-align: left;
		font-weight: 600;
		color: var(--label-2);
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	th,
	td {
		padding: 6px 10px;
		white-space: nowrap;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--label);
	}
	th {
		color: var(--label-2);
	}
	tbody tr + tr td {
		box-shadow: inset 0 var(--hairline) 0 var(--separator);
	}
</style>
