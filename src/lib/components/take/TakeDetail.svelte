<script lang="ts">
	// The take on screen: scene, slate, take and where it stands; the numbers of every camera
	// (CameraTable); the stills on it.
	import { t } from '$lib/i18n/messages';
	import { formatElapsed } from '$lib/take/record';
	import type { TakeScreen } from '$lib/take/screen.svelte';
	import CameraTable from './CameraTable.svelte';

	let { screen }: { screen: TakeScreen } = $props();
	const take = $derived(screen.take);
</script>

<div class="take-detail">
	<header>
		<dl class="ident">
			<div><dt>{t('take.scene')}</dt><dd class="num">{take.scene}</dd></div>
			<div><dt>{t('take.slate')}</dt><dd class="num">{take.slate}</dd></div>
			<div class="big"><dt>{t('take.take')}</dt><dd class="num">{take.take}</dd></div>
		</dl>
		<p class="phase {screen.phase}" role="status">
			<span class="shape" aria-hidden="true"></span>
			<span class="word">{t(`phase.${screen.phase}`)}</span>
			{#if screen.phase !== 'idle'}<span class="time num">{formatElapsed(screen.elapsed)}</span>{/if}
		</p>
	</header>

	<CameraTable {screen} />

	<section class="stills" aria-label={t('stills.title')}>
		<h2>{t('stills.title')} <span class="num">{take.stills.length || ''}</span></h2>
		{#if take.stills.length}
			<ul>
				{#each take.stills as still, i (still.id)}
					<li><img src={still.url} alt={t('stills.alt', { n: i + 1, take: take.take })} /></li>
				{/each}
			</ul>
		{:else}
			<p class="none">{t('stills.none')}</p>
		{/if}
	</section>
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
	/* The shape says the state without colour: a ring ready, a square rolling, a bar filed. */
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
	/* Night: no bright slab. An outline, the square and the word. */
	:global(.ios-night) .phase.rolling {
		background: transparent;
		box-shadow: inset 0 0 0 2.5px var(--record);
		color: var(--record);
	}
	.time {
		font-family: var(--font-rounded);
		font-size: 22px;
		font-weight: 700;
	}
	h2 {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.stills {
		margin-top: 6px;
	}
	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 8px;
		margin-top: 8px;
	}
	li {
		aspect-ratio: 4 / 3;
		border-radius: 12px;
		overflow: hidden;
		background: var(--fill-3);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.none {
		margin-top: 4px;
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
	/* Night: a still must not light the set. Grey, then red through the cell behind it. */
	:global(.ios-night) li {
		background: var(--label);
	}
	:global(.ios-night) img {
		filter: grayscale(1) brightness(0.75);
		mix-blend-mode: multiply;
	}
	@container (max-width: 380px) {
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
