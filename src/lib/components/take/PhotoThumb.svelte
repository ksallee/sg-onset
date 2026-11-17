<script lang="ts">
	// One photo or video of a take: the file just taken while the store writes it, else the stored
	// bytes. The bytes are read only for the ones on screen, and let go when one leaves it. A video
	// shows its first frame and does not play. A drawing on a photo (#86) shows over it, cropped as
	// the photo is.
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import Shapes from '$lib/components/draw/Shapes.svelte';
	import { isBlank } from '$lib/draw/drawing';
	import { originalFile } from '$lib/draw/markup';
	import { valueText } from '$lib/draw/paint';
	import type { Still } from '$lib/model/types';

	let { still, pending, alt, video = false }: { still: Still; pending?: string; alt: string; video?: boolean } = $props();

	const app = useApp();
	let url = $state<string | undefined>(undefined);
	const markups = liveList('markup', () => still.id);
	const markup = $derived(markups.value[0]);
	const src = $derived(pending ?? url);

	$effect(() => {
		if (pending) return;
		const id = still.id;
		let made: string | undefined;
		let gone = false;
		void (async () => {
			const meta = originalFile(await app.store.blobsOf(id));
			const blob = meta ? await app.store.blob(meta.id) : undefined;
			if (gone || !blob) return;
			made = URL.createObjectURL(blob);
			url = made;
		})();
		return () => {
			gone = true;
			if (made) URL.revokeObjectURL(made);
		};
	});
</script>

<!-- `#t`: Safari draws the first frame only once asked for a moment of the video. -->
{#if src && video}<span class="frame" role="img" aria-label={alt}><video src="{src}#t=0.001" muted playsinline preload="metadata" aria-hidden="true"></video></span>
{:else if src}<img {src} {alt} />
{:else}<span class="blank" role="img" aria-label={alt}></span>{/if}
{#if markup && !isBlank(markup) && src && !video}
	<svg class="over" viewBox="0 0 {markup.width} {markup.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<Shapes shapes={markup.shapes} value={(d) => valueText(d, settings.value.units)} />
	</svg>
{/if}

<style>
	img,
	video,
	.frame,
	.blank {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.over {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* Red night mode: a photo must not light the set. Grey, then red through the cell behind it. */
	:global([data-night='true']) :is(img, video),
	:global([data-night='true']) .over {
		filter: grayscale(1) brightness(0.75);
		mix-blend-mode: multiply;
	}
</style>
