<script lang="ts">
	// Drawing on a photo (#86): the photo with a canvas over it, strokes, text and dimension lines
	// with a typed length. The drawing is kept beside the photo (the `markup` table); the photo
	// itself is never touched. While it is open the flattener leaves the photo alone; once it
	// closes, the annotated copy is made for Flow PT and the wrap package (lib/draw/flattener.ts).
	import { Hand, PenLine, Ruler, Type } from '@lucide/svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import type { Ink } from '$lib/draw/drawing';
	import type { Tool } from '$lib/draw/gesture';
	import { originalFile } from '$lib/draw/markup';
	import { t } from '$lib/i18n/messages';
	import type { Still } from '$lib/model/types';
	import DrawEditor from './DrawEditor.svelte';
	import { coverScreen } from './screen';
	import { DrawSession, type EditChange } from './session.svelte';

	let { still, n, take, onclose }: { still: Still; n: number; take: string; onclose: () => void } = $props();

	coverScreen();
	const app = useApp();
	const rows = liveList('markup', () => still.id);
	const row = $derived(rows.value[0]);
	const session = new DrawSession(
		app,
		'markup',
		() => rows.value[0],
		(id, shapes) => ({ id, stillId: still.id, width: photo?.width ?? 1, height: photo?.height ?? 1, shapes })
	);

	/** The photo's own file, and its size as shown: the drawing is in its pixels. */
	let photo = $state<{ url: string; width: number; height: number } | null>(null);
	let gone = $state(false);
	$effect(() => {
		const id = still.id;
		let url: string | undefined;
		let stopped = false;
		void (async () => {
			const original = originalFile(await app.store.blobsOf(id));
			const blob = original ? await app.store.blob(original.id) : undefined;
			if (stopped) return;
			if (!blob) {
				gone = true;
				return;
			}
			url = URL.createObjectURL(blob);
			const img = new Image();
			img.src = url;
			try {
				await img.decode();
			} catch {
				if (!stopped) gone = true;
				return;
			}
			if (!stopped) photo = { url, width: img.naturalWidth, height: img.naturalHeight };
		})();
		return () => {
			stopped = true;
			if (url) URL.revokeObjectURL(url);
		};
	});
	// Nothing is flattened under the pen; the copy is made once the drawing closes.
	$effect(() => app.flattener.hold(still.id));

	let tool = $state<Tool>('draw');
	let ink = $state<Ink>('red');
	const size = $derived(photo && rows.ready ? { width: row?.width ?? photo.width, height: row?.height ?? photo.height } : null);

	const TOOLS = [
		{ id: 'move', label: t('draw.tool.move'), icon: Hand },
		{ id: 'draw', label: t('draw.tool.draw'), icon: PenLine },
		{ id: 'text', label: t('draw.tool.text'), icon: Type },
		{ id: 'measure', label: t('draw.tool.measure'), icon: Ruler }
	] satisfies { id: Tool; label: string; icon: unknown }[];
	const LABELS: Record<EditChange, Parameters<typeof t>[0]> = {
		draw: 'draw.edit.draw',
		measure: 'draw.edit.measure',
		text: 'draw.edit.text',
		move: 'draw.edit.change',
		turn: 'draw.edit.change',
		place: 'draw.edit.change',
		delete: 'draw.edit.change'
	};
</script>

<DrawEditor
	{session}
	title={t('draw.photo.title', { n, take })}
	label={t('draw.photo.canvas', { n })}
	hand={settings.value.hand}
	units={settings.value.units}
	{size}
	shapes={session.shapes}
	photo={photo?.url}
	unavailable={gone ? t('draw.photo.gone') : undefined}
	toolset={TOOLS}
	bind:tool
	bind:ink
	hint={t(`draw.hint.${tool as 'move' | 'draw' | 'text' | 'measure'}`)}
	changeLabel={(change) => ({ key: LABELS[change], params: { n } })}
	newId={() => app.newId()}
	{onclose}
/>
