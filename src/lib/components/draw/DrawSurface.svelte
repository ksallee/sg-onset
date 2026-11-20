<script lang="ts">
	// The drawing canvas: the photo (or a blank sheet) with its shapes, fitted to the room it has,
	// and every touch and Pencil stroke turned into a change. The rules are lib/draw/gesture.ts;
	// this feeds it points in drawing units and draws what it says. Changes and questions go up:
	// the owner saves them and asks for words.
	import type { UnitSystem } from '$lib/model/length';
	import { INKS, styleFor, type Dimension, type Drawing, type Figure, type Ink, type Shape } from '$lib/draw/drawing';
	import { fitView, handles, textBox, toDrawing } from '$lib/draw/geometry';
	import { IDLE, pointerCancel, pointerDown, pointerMove, pointerUp, preview, type Ask, type Change, type Context, type Gesture, type Pointer, type Result, type Tool } from '$lib/draw/gesture';
	import { valueText } from '$lib/draw/paint';
	import { clientSize } from '$lib/components/ios/size';
	import Shapes from './Shapes.svelte';

	let {
		drawing,
		photo,
		tool,
		ink,
		units,
		selected = $bindable(null),
		label,
		captions,
		fov,
		reach,
		newId,
		oncommit,
		onask
	}: {
		drawing: Drawing;
		/** The photo under the drawing, as a URL. None: a blank sheet. */
		photo?: string;
		tool: Tool;
		ink: Ink;
		units: UnitSystem;
		selected?: string | null;
		label: string;
		captions?: (f: Figure) => string[];
		/** A camera symbol's field of view, and how far its wedge reaches. */
		fov?: (f: Figure) => number | undefined;
		reach?: number;
		newId: () => string;
		oncommit: (shapes: Shape[], change: Change) => void;
		onask: (ask: Ask) => void;
	} = $props();

	let boxW = $state(0);
	let boxH = $state(0);
	let svg = $state<SVGSVGElement | null>(null);
	let gesture = $state.raw<Gesture>(IDLE);
	let penSeen = $state(false);

	const view = $derived(fitView({ width: boxW, height: boxH }, drawing));
	const style = $derived(styleFor(drawing));
	/** 22 px to touch a shape, 8 px of wander in a tap, whatever the zoom. */
	const ctx = $derived<Context>({
		tool,
		ink,
		shapes: drawing.shapes,
		size: drawing,
		selected,
		penSeen,
		tol: view.scale ? 22 / view.scale : 22,
		slop: view.scale ? 8 / view.scale : 8,
		style,
		newId
	});
	const shown = $derived(preview(drawing.shapes, gesture, ctx));
	const picked = $derived(selected ? shown.shapes.find((s) => s.id === selected) : undefined);
	const value = (d: Dimension) => valueText(d, units);

	function pointer(e: PointerEvent): Pointer {
		const rect = svg!.getBoundingClientRect();
		const kind = e.pointerType === 'pen' || e.pointerType === 'mouse' ? e.pointerType : 'touch';
		return { id: e.pointerId, kind, at: toDrawing(view, { x: e.clientX - rect.left, y: e.clientY - rect.top }) };
	}

	function take(r: Result) {
		gesture = r.gesture;
		if (r.penSeen) penSeen = true;
		if (r.selected !== undefined) selected = r.selected;
		if (r.commit) oncommit(r.commit.shapes, r.commit.change);
		if (r.ask) onask(r.ask);
	}

	function down(e: PointerEvent) {
		if (!svg || !view.scale || (e.pointerType === 'mouse' && e.button !== 0)) return;
		e.preventDefault();
		svg.setPointerCapture?.(e.pointerId);
		take(pointerDown(gesture, ctx, pointer(e)));
	}
	function move(e: PointerEvent) {
		if (gesture.kind === 'idle' || !svg) return;
		// The Pencil reports more points than frames: each one counts for a smooth line.
		const events = gesture.kind === 'stroke' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
		let g: Gesture = gesture;
		for (const each of events.length ? events : [e]) g = pointerMove(g, ctx, pointer(each)).gesture;
		gesture = g;
	}
	function up(e: PointerEvent) {
		if (gesture.kind === 'idle') return;
		take(pointerUp(gesture, ctx, pointer(e)));
	}
	function cancel() {
		take(pointerCancel(gesture));
	}

	/** A ring round the shape picked, in screen pixels. */
	const ring = $derived(view.scale ? 2 / view.scale : 2);
	const knob = $derived(view.scale ? 11 / view.scale : 11);
	function outline(shape: Shape): { x: number; y: number; width: number; height: number } {
		switch (shape.kind) {
			case 'text':
				return textBox(shape);
			case 'symbol':
				return { x: shape.at.x - shape.size * 0.8, y: shape.at.y - shape.size * 0.8, width: shape.size * 1.6, height: shape.size * 1.6 };
			case 'dimension': {
				const x = Math.min(shape.a.x, shape.b.x);
				const y = Math.min(shape.a.y, shape.b.y);
				return { x, y, width: Math.abs(shape.b.x - shape.a.x), height: Math.abs(shape.b.y - shape.a.y) };
			}
			case 'stroke': {
				const xs = shape.points.filter((_, i) => i % 2 === 0);
				const ys = shape.points.filter((_, i) => i % 2 === 1);
				const pad = shape.width / 2;
				return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 };
			}
		}
	}
</script>

<div class="room" {@attach clientSize((w, h) => ((boxW = w), (boxH = h)))}>
	{#if view.scale}
		<div class="paper" style:width="{view.width}px" style:height="{view.height}px">
		<svg
			bind:this={svg}
			class="surface"
			class:sheet={!photo}
			role="img"
			aria-label={label}
			width={view.width}
			height={view.height}
			viewBox="0 0 {drawing.width} {drawing.height}"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={cancel}
			onlostpointercapture={(e) => gesture.kind !== 'idle' && 'pointer' in gesture && gesture.pointer === e.pointerId && cancel()}
		>
			{#if photo}
				<image href={photo} width={drawing.width} height={drawing.height} preserveAspectRatio="none" />
			{/if}
			<Shapes shapes={shown.shapes} live={shown.live} {value} {captions} {fov} {reach} />
			{#if picked}
				{@const box = outline(picked)}
				<rect class="ring" x={box.x - ring * 3} y={box.y - ring * 3} width={box.width + ring * 6} height={box.height + ring * 6} rx={ring * 3} stroke-width={ring} stroke-dasharray="{ring * 3} {ring * 2}" />
				{#each handles(picked) as h (h.handle)}
					<circle class="knob" cx={h.at.x} cy={h.at.y} r={knob} stroke-width={ring} fill={INKS.white} stroke={INKS.black} />
				{/each}
			{/if}
		</svg>
		</div>
	{/if}
</div>

<style>
	.room {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	.surface {
		display: block;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: crosshair;
	}
	/* The diagram's sheet. Its own white, as the exported image has: the drawing reads the same. */
	.sheet {
		background: #ffffff;
	}
	.ring {
		fill: none;
		stroke: var(--tint);
	}
	/* Red night mode: the photo and its drawing must not light the set. Grey, then red through
	   the paper behind it, as a photo thumbnail. */
	:global([data-night='true']) .paper {
		background: var(--label);
	}
	:global([data-night='true']) .surface {
		filter: grayscale(1) brightness(0.75);
		mix-blend-mode: multiply;
	}
</style>
