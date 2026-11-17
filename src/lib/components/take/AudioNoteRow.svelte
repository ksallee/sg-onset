<script lang="ts">
	// One audio note of a take, in the take sheet: its number and time, Play or Pause, and a remove
	// button. The file just made while the store writes it, else the stored bytes, read when the
	// row shows and let go when it leaves: Play then starts in the tap itself, as iPadOS wants.
	// Removing is undoable, so nothing asks first.
	import { Pause, Play, X } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { formatTime } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import type { Still } from '$lib/model/types';
	import { formatElapsed } from '$lib/take/record';

	let {
		still,
		n,
		pending,
		playing = $bindable(null),
		onremove
	}: { still: Still; n: number; pending?: string; playing?: string | null; onremove: () => void } = $props();

	const app = useApp();
	let stored = $state<string | undefined>(undefined);
	let audio = $state<HTMLAudioElement | null>(null);
	let paused = $state(true);
	let at = $state(0);
	let length = $state(0);
	const src = $derived(pending ?? stored);

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
			stored = made;
		})();
		return () => {
			gone = true;
			if (made) URL.revokeObjectURL(made);
		};
	});
	// Another note plays: this one stops.
	$effect(() => {
		if (playing !== still.id && audio && !audio.paused) audio.pause();
	});

	function toggle() {
		if (!audio || !src) return;
		if (audio.paused) {
			playing = still.id;
			void audio.play().catch(() => {
				if (playing === still.id) playing = null;
			});
		} else audio.pause();
	}
	/** A WebM from MediaRecorder says no length until it is read through: none is shown then. */
	const detail = $derived(!paused || at > 0 ? formatElapsed(at * 1000) : Number.isFinite(length) && length > 0 ? formatElapsed(length * 1000) : undefined);
</script>

<Row title={t('audio.row', { n })} subtitle={formatTime(still.capturedAt) || undefined} {detail}>
	{#snippet trailing()}
		<button type="button" class="act" aria-label={t(paused ? 'audio.play' : 'audio.pause', { n })} disabled={!src} onclick={toggle}>
			{#if paused}<Play class="size-5" strokeWidth={2.4} />{:else}<Pause class="size-5" strokeWidth={2.4} />{/if}
		</button>
		<button type="button" class="act remove" aria-label={t('audio.remove', { n })} onclick={onremove}><X class="size-4" strokeWidth={3} /></button>
		<audio
			bind:this={audio}
			{src}
			preload="metadata"
			onplay={() => (paused = false)}
			onpause={() => (paused = true)}
			onended={() => {
				paused = true;
				at = 0;
				if (playing === still.id) playing = null;
			}}
			ontimeupdate={() => (at = audio?.currentTime ?? 0)}
			onloadedmetadata={() => (length = audio?.duration ?? 0)}
		></audio>
	{/snippet}
</Row>

<style>
	/* 44 px to tap, inside the row's own height. */
	.act {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin: -11px 0;
		border-radius: 50%;
		color: var(--tint);
	}
	.act:disabled {
		color: var(--label-3);
	}
	.act:active {
		background: var(--fill-3);
	}
	.remove {
		margin-right: -12px;
		color: var(--label-2);
	}
	audio {
		display: none;
	}
</style>
