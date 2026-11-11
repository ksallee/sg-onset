<script lang="ts">
	// Shoot's own edit notice (the shell shows none on a focus page): the last labelled edit with
	// Undo, an undo with Redo, for a few seconds. It sits at the foot of the main column, clear of
	// the rail and the dock under the thumb. It shows at once; it goes by itself.
	import { useApp } from '$lib/app/app.svelte';
	import { t, tk } from '$lib/i18n/messages';

	let { issue = null, since = 0 }: { issue?: string | null; since?: number } = $props();

	const app = useApp();
	const NOTICE_MS = 6000;
	// Only what was done here (since the page opened): an edit made on another page was said there.
	const edit = $derived(app.lastEdit && app.lastEdit.at >= since ? app.lastEdit : null);
	const what = $derived(edit?.label ? tk(edit.label.key, edit.label.params) : '');
	const notice = $derived.by(() => {
		if (issue) return { text: issue };
		if (!edit) return null;
		if (edit.kind === 'tooLate') return { text: t('notice.tooLate') };
		if (!what) return null;
		if (edit.kind === 'undone') return { text: t('notice.undone', { what }), action: t('notice.redo'), run: () => app.edit.redo() };
		if (edit.kind === 'redone') return { text: t('notice.redone', { what }), action: t('notice.undo'), run: () => app.edit.undo() };
		return { text: what, action: t('notice.undo'), run: () => app.edit.undo() };
	});
	$effect(() => {
		if (!edit) return;
		const timer = setTimeout(() => app.dismissEdit(), Math.max(0, edit.at + NOTICE_MS - Date.now()));
		return () => clearTimeout(timer);
	});
</script>

{#if notice}
	<div class="undo-notice" role="status">
		<span class="text">{notice.text}</span>
		{#if notice.action && notice.run}<button type="button" onclick={() => void notice.run?.()}>{notice.action}</button>{/if}
	</div>
{/if}

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
		box-shadow:
			inset 0 0 0 2px var(--label),
			0 8px 24px rgb(0 0 0 / 0.25);
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
		min-height: var(--touch, 44px);
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
	:global([data-night='true']) button {
		background: transparent;
		box-shadow: inset 0 0 0 2px var(--label);
		color: var(--label);
	}
	@media (prefers-reduced-motion: no-preference) {
		:global([data-motion='full']) .undo-notice {
			animation: rise 180ms cubic-bezier(0.23, 1, 0.32, 1);
		}
	}
	@keyframes rise {
		from {
			opacity: 0.4;
			transform: translateY(8px);
		}
	}
</style>
