<script lang="ts">
	// A small picture of the device as the hand setting lays it out: the action rail with the
	// take button on the holding hand's edge, the sections on the other. It moves as the setting
	// changes. Token colours only, so it holds in red night mode.
	import type { Hand } from '$lib/ios/handedness';

	let { hand, label }: { hand: Hand; label: string } = $props();
</script>

<svg class="diagram" viewBox="0 0 88 60" width="88" height="60" role="img" aria-label={label} data-hand={hand}>
	<rect class="body" x="1" y="1" width="86" height="58" rx="9" />
	<g class="parts">
		<!-- The sections, away from the hand. -->
		<rect class="nav" x="7" y="8" width="5" height="44" rx="2.5" />
		<!-- The page. -->
		<rect class="line" x="19" y="12" width="30" height="4" rx="2" />
		<rect class="line dim" x="19" y="22" width="40" height="4" rx="2" />
		<rect class="line dim" x="19" y="32" width="34" height="4" rx="2" />
		<!-- The rail: the take button and two more, under the thumb. -->
		<circle class="take" cx="74" cy="26" r="7" />
		<circle class="more" cx="74" cy="41" r="3" />
		<circle class="more" cx="74" cy="50" r="3" />
	</g>
</svg>

<style>
	.diagram {
		display: block;
		flex: none;
		overflow: visible;
	}
	.body {
		fill: var(--fill-3);
		stroke: var(--label-3);
		stroke-width: 1.5;
	}
	.parts {
		transform-box: view-box;
		transform-origin: 44px 30px;
		transition: transform var(--dur-control) var(--ease-ios);
	}
	[data-hand='left'] .parts {
		transform: scaleX(-1);
	}
	.nav {
		fill: var(--label-3);
	}
	.line {
		fill: var(--label-2);
	}
	.line.dim {
		fill: var(--label-3);
	}
	.take {
		fill: none;
		stroke: var(--tint);
		stroke-width: 3;
	}
	.more {
		fill: var(--tint);
	}
</style>
