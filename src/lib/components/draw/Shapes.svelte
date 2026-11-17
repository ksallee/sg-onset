<script lang="ts">
	// The shapes of a drawing as SVG, inside an <svg> whose viewBox is the drawing's size. Drawn
	// from the same geometry and in the same order as the flattened image (lib/draw/geometry.ts),
	// so what shows is what is exported. No interaction: the canvas and the thumbnails use it.
	import { INKS, type Dimension, type Figure, type Shape, type Stroke } from '$lib/draw/drawing';
	import { dimensionParts, figureLine, figureParts, paintOrder } from '$lib/draw/geometry';
	import { FONT, haloOf } from '$lib/draw/paint';

	let {
		shapes,
		live,
		value,
		captions
	}: {
		shapes: readonly Shape[];
		/** The line being drawn. */
		live?: Stroke | Dimension;
		/** The words on a dimension line. */
		value: (d: Dimension) => string;
		/** The words under a symbol. */
		captions?: (f: Figure) => string[];
	} = $props();

	const ordered = $derived(paintOrder(live ? [...shapes, live] : shapes));
	const flat = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
	const pairs = (points: number[]) => {
		const out: string[] = [];
		for (let i = 0; i + 1 < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
		return out.join(' ');
	};
</script>

{#snippet words(text: string, x: number, y: number, size: number, ink: Shape['ink'], angle = 0)}
	<text
		{x}
		{y}
		transform={angle ? `rotate(${angle} ${x} ${y})` : undefined}
		font-size={size}
		font-weight="600"
		font-family={FONT}
		text-anchor="middle"
		dominant-baseline="central"
		fill={INKS[ink]}
		stroke={haloOf(ink)}
		stroke-width={size * 0.16}
		stroke-linejoin="round"
		paint-order="stroke">{text}</text
	>
{/snippet}

<g class="shapes" fill="none" stroke-linecap="round" stroke-linejoin="round">
	{#each ordered as shape (shape.id)}
		{#if shape.kind === 'stroke'}
			<polyline points={pairs(shape.points)} stroke={INKS[shape.ink]} stroke-width={shape.width} />
		{:else if shape.kind === 'dimension'}
			{@const parts = dimensionParts(shape)}
			<g stroke={INKS[shape.ink]} stroke-width={shape.width}>
				<line x1={shape.a.x} y1={shape.a.y} x2={shape.b.x} y2={shape.b.y} />
				{#each parts.ticks as [p, q], i (i)}<line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />{/each}
			</g>
			{@render words(value(shape), parts.label.at.x, parts.label.at.y, shape.size, shape.ink, parts.label.angle)}
		{:else if shape.kind === 'symbol'}
			<g stroke={INKS[shape.ink]} stroke-width={figureLine(shape)}>
				{#each figureParts(shape) as part, i (i)}
					{#if part.kind === 'circle'}
						<circle cx={part.at.x} cy={part.at.y} r={part.r} fill={part.fill ? INKS[shape.ink] : 'none'} />
					{:else if part.closed}
						<polygon points={flat(part.points)} fill={part.fill ? INKS[shape.ink] : 'none'} />
					{:else}
						<polyline points={flat(part.points)} />
					{/if}
				{/each}
			</g>
			{#each captions?.(shape) ?? [] as line, i (i)}
				{@render words(line, shape.at.x, shape.at.y + shape.size * 1.05 + i * shape.size * 0.54, shape.size * 0.45, shape.ink)}
			{/each}
		{:else}
			{@render words(shape.text, shape.at.x, shape.at.y, shape.size, shape.ink)}
		{/if}
	{/each}
</g>
