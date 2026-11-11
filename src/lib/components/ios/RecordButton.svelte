<script lang="ts">
	// Record, on the action rail: a ring the size of the capture target with a disc in it; while
	// rolling the disc is a square, so the state reads without colour. Two lines under it: what
	// the press does, and which take or how long it has rolled. The lines keep their height, so
	// nothing under the button moves when a take starts. No motion: it is the capture path.
	let {
		rolling,
		label,
		caption = label,
		detail = '',
		onclick
	}: { rolling: boolean; label: string; caption?: string; detail?: string; onclick: () => void } = $props();
</script>

<button type="button" class="ios-record" class:rolling aria-label="{label} {detail}" {onclick}>
	<span class="ring"><span class="disc"></span></span>
	<span class="caption">{caption}</span>
	<span class="detail num">{detail}</span>
</button>

<style>
	.ios-record {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		width: var(--target);
		color: var(--label);
	}
	.ring {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--target);
		height: var(--target);
		margin-bottom: 4px;
		border-radius: 50%;
		border: 4px solid var(--label);
	}
	.disc {
		width: calc(var(--target) - 20px);
		height: calc(var(--target) - 20px);
		border-radius: 50%;
		background: var(--record);
	}
	.rolling .ring {
		border-color: var(--record);
	}
	.rolling .disc {
		width: 42%;
		height: 42%;
		border-radius: 7px;
	}
	.ios-record:active .disc {
		opacity: 0.6;
	}
	.ios-record:focus-visible {
		outline: none;
	}
	.ios-record:focus-visible .ring {
		outline: 2px solid var(--tint);
		outline-offset: 3px;
	}
	.caption {
		font-size: 12px;
		line-height: 14px;
		font-weight: 600;
		white-space: nowrap;
	}
	.detail {
		height: 16px;
		font-size: 13px;
		line-height: 16px;
		font-weight: 600;
		color: var(--label-2);
		white-space: nowrap;
	}
	.rolling .detail {
		color: var(--record);
		font-weight: 700;
	}
</style>
