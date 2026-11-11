<script lang="ts">
	// The iPad screen: a list, the main view, a dock and an action rail, side by side. The rail is
	// on the edge under the holding thumb (`hand`), the dock beside it, the list on the far side;
	// the left hand mirrors every column (ios/handedness.ts). Tall (an iPad in portrait): the list
	// becomes a strip on top. Compact (a phone-width window): one stack, the rail along the foot.
	// Each snippet is told where it sits. Nothing here moves: the columns are fixed, so opening the
	// keypad in the dock shifts no field. `class` forces a theme (`ios-dark ios-night`), `target`
	// and `gap` are the capture target and its spacing in px (ios/target.ts).
	import type { Snippet } from 'svelte';
	import { formFor, gridAreas, workspaceLayout, type Form, type Hand, type WorkspaceLayout } from '$lib/ios/handedness';
	import { setScreen } from './layer.svelte';

	let {
		hand = 'right',
		target = 78,
		gap = 16,
		class: cls = '',
		list,
		main,
		dock,
		rail
	}: {
		hand?: Hand;
		target?: number;
		gap?: number;
		class?: string;
		list: Snippet<[WorkspaceLayout['list'], Form]>;
		main: Snippet<[Form]>;
		dock: Snippet<[Form]>;
		rail: Snippet<[WorkspaceLayout['rail']]>;
	} = $props();

	let el = $state<HTMLElement | null>(null);
	let width = $state(typeof window === 'undefined' ? 1180 : window.innerWidth);
	const layout = $derived(workspaceLayout(hand, formFor(width)));
	const widths: Record<string, string> = { list: 'var(--list-w)', main: 'minmax(0, 1fr)', dock: 'var(--dock-w)', rail: 'auto' };

	setScreen({
		scrollY: 0,
		get el() {
			return el;
		}
	});
</script>

<div
	class="ios-workspace {cls}"
	data-ios-screen
	data-form={layout.form}
	data-rail={layout.rail}
	bind:this={el}
	bind:clientWidth={width}
	style:--target="{target}px"
	style:--gap="{gap}px"
	style:grid-template-areas={gridAreas(layout)}
	style:grid-template-columns={layout.columns.map((a) => widths[a]).join(' ')}
>
	<div class="area list" data-at={layout.list}>{@render list(layout.list, layout.form)}</div>
	<main class="area main">{@render main(layout.form)}</main>
	<div class="area dock">{@render dock(layout.form)}</div>
	<div class="area rail">{@render rail(layout.rail)}</div>
</div>

<style>
	.ios-workspace {
		--list-w: 248px;
		/* Three keys across at the capture target, so a 20 mm key is 20 mm wide too. */
		--dock-w: max(304px, calc(var(--target) * 3 + 40px));
		position: relative;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		height: var(--app-height, 100dvh);
		padding-top: var(--safe-top);
		background: var(--bg);
		color: var(--label);
		/* Clip, not hidden: nothing inside (the rail's file input) can scroll it by script. */
		overflow: clip;
	}
	.ios-workspace[data-form='tall'] {
		grid-template-rows: auto minmax(0, 1fr);
	}
	.ios-workspace[data-form='compact'] {
		grid-template-rows: auto minmax(0, 1fr) auto auto;
	}
	.area {
		position: relative;
		min-width: 0;
		min-height: 0;
	}
	.list {
		grid-area: list;
		z-index: 2;
	}
	.main {
		grid-area: main;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overscroll-behavior-y: contain;
	}
	.dock {
		grid-area: dock;
		display: flex;
		flex-direction: column;
	}
	.rail {
		grid-area: rail;
		z-index: 2;
	}
	.list[data-at='side'] {
		overflow-y: auto;
		overscroll-behavior-y: contain;
		background: var(--sidebar);
	}
	/* Hairlines between the columns: on the side that faces the main view. */
	[data-rail='right'] .list[data-at='side'] {
		border-right: var(--hairline) solid var(--separator);
	}
	[data-rail='left'] .list[data-at='side'] {
		border-left: var(--hairline) solid var(--separator);
	}
	.list[data-at='top'] {
		border-bottom: var(--hairline) solid var(--separator);
	}
	/* The dock's own height, for what it holds: `cqh` puts keys at the thumb's height. */
	[data-form='wide'] .dock,
	[data-form='tall'] .dock {
		container-type: size;
	}
	[data-form='compact'] .dock {
		border-top: var(--hairline) solid var(--separator);
	}
</style>
