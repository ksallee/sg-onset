<script lang="ts">
	// The photos and videos of the take on screen, as a strip of thumbnails, each with its camera
	// and a remove button; a video has a mark. Removing is undoable, so nothing asks first.
	import { Video, X } from '@lucide/svelte';
	import { t } from '$lib/i18n/messages';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import PhotoThumb from './PhotoThumb.svelte';

	let { shoot }: { shoot: Shoot } = $props();
	const number = $derived(shoot.group?.number ?? '');
	const camOf = (takeId: string) => {
		const take = shoot.group?.takes.find((x) => x.id === takeId);
		return shoot.columns.find((c) => c.id === take?.cameraSetupId)?.label ?? '';
	};
</script>

<section class="photos" aria-label={t('photos.title')}>
	<h2>{t('photos.title')} <span class="num">{shoot.groupStills.length || ''}</span></h2>
	{#if shoot.groupStills.length}
		<ul>
			{#each shoot.groupStills as still, i (still.id)}
				{@const cam = camOf(still.takeId)}
				{@const video = shoot.kindOf(still) === 'video'}
				<li>
					<PhotoThumb {still} {video} pending={shoot.pending[still.id]} alt={t(video ? 'photos.alt.video' : 'photos.alt', { n: i + 1, take: number })} />
					{#if cam}<span class="cam">{cam}</span>{/if}
					{#if video}<span class="kind" aria-hidden="true"><Video class="size-4" strokeWidth={2.4} /></span>{/if}
					<button type="button" class="remove" aria-label={t(video ? 'photos.remove.video' : 'photos.remove', { n: i + 1 })} onclick={() => shoot.removeStill(still)}><X class="size-4" strokeWidth={3} /></button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="none">{t('photos.none')}</p>
	{/if}
</section>

<style>
	h2 {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	ul {
		display: flex;
		gap: 8px;
		margin-top: 8px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		padding-bottom: 2px;
	}
	li {
		position: relative;
		flex: none;
		width: 128px;
		aspect-ratio: 4 / 3;
		border-radius: 12px;
		overflow: hidden;
		background: var(--fill-3);
	}
	:global([data-night='true']) li {
		background: var(--label);
	}
	.cam {
		position: absolute;
		left: 6px;
		bottom: 6px;
		min-width: 22px;
		padding: 1px 6px;
		border-radius: 7px;
		background: var(--bg);
		color: var(--label);
		font-size: 13px;
		font-weight: 700;
		text-align: center;
	}
	/* A video's mark, in the corner the camera label and the remove button leave free. */
	.kind {
		position: absolute;
		right: 6px;
		bottom: 6px;
		display: flex;
		padding: 3px 5px;
		border-radius: 7px;
		background: var(--bg);
		color: var(--label);
	}
	/* 44 px to tap, a small disc to see. */
	.remove {
		position: absolute;
		top: 0;
		right: 0;
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		width: 44px;
		height: 44px;
		padding: 6px;
		color: var(--label);
	}
	.remove :global(svg) {
		box-sizing: content-box;
		padding: 4px;
		border-radius: 50%;
		background: var(--bg);
	}
	.remove:active :global(svg) {
		background: var(--label);
		color: var(--bg);
	}
	.none {
		margin-top: 4px;
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
</style>
