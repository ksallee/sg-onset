<script lang="ts">
	// Drawing on a photo (#86): the photo with a canvas over it, strokes, text and dimension lines
	// with a typed length. The drawing is kept beside the photo (the `markup` table); the photo
	// itself is never touched. While it is open the flattener leaves the photo alone; once it
	// closes, the annotated copy is made for Flow PT and the wrap package (lib/draw/flattener.ts).
	import { Hand, PenLine, Ruler, Type } from '@lucide/svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import type { Label } from '$lib/app/undo';
	import { addText, readLength, removeShape, setText, setValue, styleFor, type Ink, type Shape } from '$lib/draw/drawing';
	import type { Ask, Change, Tool } from '$lib/draw/gesture';
	import { originalFile } from '$lib/draw/markup';
	import { t } from '$lib/i18n/messages';
	import { formatLength } from '$lib/model/length';
	import type { Still } from '$lib/model/types';
	import AskSheet from './AskSheet.svelte';
	import DrawCover from './DrawCover.svelte';
	import DrawSurface from './DrawSurface.svelte';
	import DrawTools from './DrawTools.svelte';
	import { coverScreen } from './screen';
	import { DrawSession } from './session.svelte';

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

	const units = $derived(settings.value.units);
	let tool = $state<Tool>('draw');
	let ink = $state<Ink>('red');
	let selected = $state<string | null>(null);
	const drawing = $derived(photo && rows.ready ? { width: row?.width ?? photo.width, height: row?.height ?? photo.height, shapes: session.shapes } : null);
	const style = $derived(drawing ? styleFor(drawing) : undefined);

	const TOOLS = [
		{ id: 'move', label: t('draw.tool.move'), icon: Hand },
		{ id: 'draw', label: t('draw.tool.draw'), icon: PenLine },
		{ id: 'text', label: t('draw.tool.text'), icon: Type },
		{ id: 'measure', label: t('draw.tool.measure'), icon: Ruler }
	] as const satisfies { id: Tool; label: string; icon: unknown }[];

	const LABELS: Record<Change | 'text' | 'delete', Parameters<typeof t>[0]> = {
		draw: 'draw.edit.draw',
		measure: 'draw.edit.measure',
		text: 'draw.edit.text',
		move: 'draw.edit.change',
		turn: 'draw.edit.change',
		place: 'draw.edit.change',
		delete: 'draw.edit.change'
	};
	const label = (change: keyof typeof LABELS): Label => ({ key: LABELS[change], params: { n } });

	function commit(shapes: Shape[], change: keyof typeof LABELS) {
		session.commit(shapes, label(change));
	}

	// ---- words: a text, or a dimension line's length
	let asking = $state.raw<Ask | null>(null);
	let askOpen = $state(false);
	const askedShape = $derived(asking && 'id' in asking && asking.id ? session.shapes.find((s) => s.id === asking!.id) : undefined);
	const askInitial = $derived.by(() => {
		const s = askedShape;
		if (s?.kind === 'text') return s.text;
		if (s?.kind === 'dimension' && s.value) return formatLength(s.value, units);
		return '';
	});
	function ask(a: Ask) {
		asking = a;
		askOpen = true;
	}
	function saveText(text: string) {
		const a = asking;
		if (a?.kind !== 'text' || !style) return;
		if (a.id) commit(setText(session.shapes, a.id, text), 'text');
		else if (text) commit(addText(session.shapes, { id: app.newId(), at: a.at, text, ink, size: style.text }), 'text');
	}
	function saveValue(text: string) {
		const a = asking;
		const read = readLength(text, units);
		if (a?.kind !== 'value' || !read.ok) return;
		commit(setValue(session.shapes, a.id, read.value), 'measure');
	}

	function remove() {
		if (!selected) return;
		commit(removeShape(session.shapes, selected), 'delete');
		selected = null;
	}

	async function close() {
		await session.settled();
		onclose();
	}
</script>

<DrawCover title={t('draw.photo.title', { n, take })} hand={settings.value.hand} hint={drawing ? t(`draw.hint.${tool as 'move' | 'draw' | 'text' | 'measure'}`) : undefined} onclose={close}>
	{#if gone}
		<p class="gone">{t('draw.photo.gone')}</p>
	{:else if drawing && photo}
		<DrawSurface
			{drawing}
			photo={photo.url}
			{tool}
			{ink}
			{units}
			bind:selected
			label={t('draw.photo.canvas', { n })}
			newId={() => app.newId()}
			oncommit={(shapes, change) => commit(shapes, change)}
			onask={ask}
		/>
	{/if}
	{#snippet tools()}
		<DrawTools tools={TOOLS} bind:tool bind:ink canUndo={session.canUndo} canRedo={session.canRedo} canDelete={!!selected} onundo={() => session.undo()} onredo={() => session.redo()} ondelete={remove} />
	{/snippet}
</DrawCover>

{#if asking?.kind === 'text'}
	<AskSheet bind:open={askOpen} title={t('draw.text.title')} label={t('draw.text.label')} initial={askInitial} footer={asking.id ? t('draw.text.footer') : undefined} onsave={saveText} />
{:else if asking?.kind === 'value'}
	<AskSheet
		bind:open={askOpen}
		title={t('draw.value.title')}
		label={t('draw.value.label')}
		initial={askInitial}
		footer={t(units === 'metric' ? 'draw.value.footer.metric' : 'draw.value.footer.imperial')}
		inputmode="text"
		check={(text) => (readLength(text, units).ok ? undefined : t('draw.value.invalid'))}
		onsave={saveValue}
	/>
{/if}

<style>
	.gone {
		margin: auto;
		max-width: 420px;
		padding: 24px;
		text-align: center;
		font-size: 17px;
		line-height: 22px;
		color: var(--label-2);
	}
</style>
