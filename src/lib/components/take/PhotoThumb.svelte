<script lang="ts">
	// One photo of a take: the file just taken while the store writes it, else the stored bytes.
	// The bytes are read only for the photos on screen, and let go when the photo leaves it.
	import { useApp } from '$lib/app/app.svelte';
	import type { Still } from '$lib/model/types';

	let { still, pending, alt }: { still: Still; pending?: string; alt: string } = $props();

	const app = useApp();
	let url = $state<string | undefined>(undefined);

	$effect(() => {
		if (pending) return;
		const id = still.id;
		let made: string | undefined;
		let gone = false;
		void (async () => {
			const [meta] = await app.store.blobsOf(id);
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

{#if pending ?? url}<img src={pending ?? url} {alt} />{:else}<span class="blank" role="img" aria-label={alt}></span>{/if}

<style>
	img,
	.blank {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* Red night mode: a photo must not light the set. Grey, then red through the cell behind it. */
	:global([data-night='true']) img {
		filter: grayscale(1) brightness(0.75);
		mix-blend-mode: multiply;
	}
</style>
