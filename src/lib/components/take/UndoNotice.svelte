<script lang="ts">
	// The undo line: what was just done, with Undo. It shows at once and goes by itself.
	import { t } from '$lib/i18n/messages';
	let { text, undoable, onundo }: { text: string; undoable: boolean; onundo: () => void } = $props();
</script>

<div class="undo-notice" role="status">
	<span class="text">{text}</span>
	{#if undoable}<button type="button" onclick={onundo}>{t('undo.undo')}</button>{/if}
</div>

<style>
	.undo-notice {
		position: sticky;
		bottom: 12px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		margin: auto 16px 12px;
		padding: 4px 4px 4px 16px;
		border-radius: 16px;
		background: var(--cell-elevated);
		box-shadow: inset 0 0 0 2px var(--label), 0 8px 24px rgb(0 0 0 / 0.25);
		color: var(--label);
		font-size: 16px;
		font-weight: 600;
	}
	.text {
		flex: 1;
		min-width: 0;
		padding: 8px 0;
	}
	button {
		flex: none;
		height: 44px;
		padding: 0 18px;
		border-radius: 12px;
		background: var(--label);
		color: var(--bg);
		font-size: 16px;
		font-weight: 700;
	}
	button:active {
		opacity: 0.6;
	}
</style>
