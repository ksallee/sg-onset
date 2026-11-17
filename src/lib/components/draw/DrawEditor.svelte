<script lang="ts">
	// A drawing open for editing, whatever it is drawn on: the cover, the canvas, the tools, and the
	// sheet that asks for a text or a length. Every change goes to the session, which saves it as
	// one undo entry. A photo's drawing and a slate's setup diagram are each a thin owner of this.
	import type { Component } from 'svelte';
	import type { Label } from '$lib/app/undo';
	import { addText, readLength, removeShape, setText, setValue, styleFor, type Figure, type Ink, type Shape, type Size } from '$lib/draw/drawing';
	import type { Ask, Tool } from '$lib/draw/gesture';
	import { t } from '$lib/i18n/messages';
	import { formatLength, type UnitSystem } from '$lib/model/length';
	import AskSheet from './AskSheet.svelte';
	import DrawCover from './DrawCover.svelte';
	import DrawSurface from './DrawSurface.svelte';
	import DrawTools from './DrawTools.svelte';
	import type { DrawSession, EditChange } from './session.svelte';

	let {
		session,
		title,
		label,
		hand,
		units,
		size,
		shapes,
		photo,
		unavailable,
		toolset,
		tool = $bindable(),
		ink = $bindable(),
		hint,
		changeLabel,
		captions,
		fov,
		reach,
		keep,
		newId,
		onclose
	}: {
		session: DrawSession;
		title: string;
		/** The canvas's name for assistive tech. */
		label: string;
		hand: 'left' | 'right';
		units: UnitSystem;
		/** The drawing's size; none while it loads. */
		size: Size | null;
		/** The shapes shown, the ones a change starts from. */
		shapes: Shape[];
		photo?: string;
		/** Why there is nothing to draw on. */
		unavailable?: string;
		toolset: { id: Tool; label: string; icon: Component }[];
		tool: Tool;
		ink: Ink;
		hint?: string;
		changeLabel: (change: EditChange) => Label;
		captions?: (f: Figure) => string[];
		fov?: (f: Figure) => number | undefined;
		reach?: number;
		/** A shape that may not be deleted. */
		keep?: (id: string) => boolean;
		newId: () => string;
		onclose: () => void;
	} = $props();

	let selected = $state<string | null>(null);
	const style = $derived(size ? styleFor(size) : undefined);
	const drawing = $derived(size ? { ...size, shapes } : null);

	function commit(next: Shape[], change: EditChange) {
		session.commit(next, changeLabel(change));
	}

	let asking = $state.raw<Ask | null>(null);
	let askOpen = $state(false);
	const askedShape = $derived(asking && 'id' in asking && asking.id ? shapes.find((s) => s.id === asking!.id) : undefined);
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
		if (a.id) commit(setText(shapes, a.id, text), 'text');
		else if (text) commit(addText(shapes, { id: newId(), at: a.at, text, ink, size: style.text }), 'text');
	}
	function saveValue(text: string) {
		const a = asking;
		const read = readLength(text, units);
		if (a?.kind !== 'value' || !read.ok) return;
		commit(setValue(shapes, a.id, read.value), 'measure');
	}
	function remove() {
		if (!selected || keep?.(selected)) return;
		commit(removeShape(shapes, selected), 'delete');
		selected = null;
	}
	async function close() {
		await session.settled();
		onclose();
	}
</script>

<DrawCover {title} {hand} hint={drawing ? hint : undefined} onclose={close}>
	{#if unavailable}
		<p class="unavailable">{unavailable}</p>
	{:else if drawing}
		<DrawSurface {drawing} {photo} {tool} {ink} {units} bind:selected {label} {captions} {fov} {reach} {newId} oncommit={commit} onask={ask} />
	{/if}
	{#snippet tools()}
		<DrawTools
			tools={toolset}
			bind:tool
			bind:ink
			canUndo={session.canUndo}
			canRedo={session.canRedo}
			canDelete={!!selected && !keep?.(selected)}
			onundo={() => session.undo()}
			onredo={() => session.redo()}
			ondelete={remove}
		/>
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
		check={(text) => (readLength(text, units).ok ? undefined : t('draw.value.invalid'))}
		onsave={saveValue}
	/>
{/if}

<style>
	.unavailable {
		margin: auto;
		max-width: 420px;
		padding: 24px;
		text-align: center;
		font-size: 17px;
		line-height: 22px;
		color: var(--label-2);
	}
</style>
