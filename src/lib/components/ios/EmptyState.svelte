<script lang="ts">
	// What a list says when it has nothing: a large icon, a title, a line, an action.
	import type { Component, Snippet } from 'svelte';
	let { icon: Icon, title, message, action }: { icon?: Component<{ class?: string; strokeWidth?: number }>; title: string; message?: string; action?: Snippet } = $props();
</script>

<div class="ios-empty">
	{#if Icon}<Icon class="size-[52px]" strokeWidth={1.4} />{/if}
	<h2>{title}</h2>
	{#if message}<p>{message}</p>{/if}
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.ios-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 48px 32px;
		color: var(--label-2);
	}
	h2 {
		margin-top: 12px;
		font-size: 22px;
		line-height: 28px;
		font-weight: 700;
		letter-spacing: -0.26px;
		color: var(--label);
	}
	p {
		margin-top: 6px;
		max-width: 300px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
	}
	.action {
		margin-top: 18px;
	}
</style>
