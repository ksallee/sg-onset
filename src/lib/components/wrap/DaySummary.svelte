<script lang="ts">
	// The day at a glance: six counts in a card, the cameras used, and when the day was last handed
	// over. The numbers come from wrap/summary.ts.
	import { Camera } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { DaySummary } from '$lib/wrap/summary';
	import { formatDuration } from '$lib/wrap/summary';
	import { plural } from '$lib/wrap/make';

	let { summary, exported }: { summary: DaySummary; exported: string } = $props();

	const stats = $derived([
		{ id: 'slates', label: t('wrap.summary.slates'), value: String(summary.slates) },
		{ id: 'takes', label: t('wrap.summary.takes'), value: String(summary.takes) },
		{ id: 'circled', label: t('wrap.summary.circled'), value: String(summary.circled) },
		{ id: 'noGood', label: t('wrap.summary.noGood'), value: String(summary.noGood) },
		{ id: 'photos', label: t('wrap.summary.photos'), value: String(summary.photos) },
		{ id: 'running', label: t('wrap.summary.running'), value: formatDuration(summary.runningMs) }
	]);
</script>

<Section header={t('wrap.summary.header')} footer={exported}>
	<dl class="stats" aria-label={t('wrap.summary.header')}>
		{#each stats as s (s.id)}
			<div class="stat {s.id}">
				<dt>{s.label}</dt>
				<dd>{s.value}</dd>
			</div>
		{/each}
	</dl>
</Section>

{#if summary.cameras.length}
	<Section header={t('wrap.summary.cameras')}>
		{#each summary.cameras as c (c.letter)}
			<Row title={t('wrap.summary.camera', { letter: c.letter })} subtitle={c.body} detail={tk(plural('wrap.summary.cameraTakes', c.takes), { n: c.takes })}>
				{#snippet leading()}<Tile icon={Camera} color="var(--tint)" />{/snippet}
			</Row>
		{/each}
	</Section>
{/if}

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
	}
	.stat {
		padding: 12px 16px 14px;
		box-shadow: inset calc(-1 * var(--hairline)) 0 0 var(--separator), inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
		min-width: 0;
	}
	.stat:nth-child(3n) {
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.stat:nth-child(n + 4) {
		box-shadow: inset calc(-1 * var(--hairline)) 0 0 var(--separator);
	}
	.stat:nth-child(6) {
		box-shadow: none;
	}
	dt {
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	dd {
		margin: 2px 0 0;
		font-size: 28px;
		line-height: 34px;
		font-weight: 600;
		letter-spacing: 0.2px;
		font-variant-numeric: tabular-nums;
		color: var(--label);
		white-space: nowrap;
	}
	.running dd {
		font-size: 22px;
	}
	.circled dd {
		color: var(--good);
	}
	.noGood dd {
		color: var(--no-good);
	}
</style>
