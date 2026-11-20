<script lang="ts">
	// One line to type for the drawing: a text, or the length of a dimension line. A full sheet,
	// so the keyboard never covers the field (kit README, Tablet first). Done or Return saves; a
	// sheet dragged away saves too, when what was typed reads. `check` gives the issue to show.
	import { untrack } from 'svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { t } from '$lib/i18n/messages';

	let {
		open = $bindable(false),
		title,
		label,
		initial = '',
		footer,
		inputmode,
		check,
		onsave
	}: {
		open?: boolean;
		title: string;
		label: string;
		initial?: string;
		footer?: string;
		inputmode?: 'text' | 'decimal';
		/** The issue with what was typed, if any. */
		check?: (text: string) => string | undefined;
		onsave: (text: string) => void;
	} = $props();

	let text = $state('');
	let error = $state<string | undefined>(undefined);
	let saved = false;

	$effect(() => {
		if (!open) return;
		text = untrack(() => initial);
		error = undefined;
		saved = false;
	});

	function save(): boolean {
		if (saved) return true;
		const issue = check?.(text.trim());
		if (issue) {
			error = issue;
			return false;
		}
		saved = true;
		onsave(text.trim());
		return true;
	}
	function done(e?: Event) {
		e?.preventDefault();
		if (save()) open = false;
	}
</script>

<Sheet bind:open {title} onclose={() => save()}>
	{#snippet trailing()}<button type="button" class="done" onclick={() => done()}>{t('draw.done')}</button>{/snippet}
	<form class="ask" onsubmit={done}>
		<Section {footer}>
			<InputRow {label} bind:value={text} {error} {inputmode} autofocus enterkeyhint="done" oninput={() => (error = undefined)} />
		</Section>
	</form>
</Sheet>

<style>
	.ask {
		padding-top: 16px;
	}
	.done {
		min-height: var(--touch, 44px);
		padding: 0 4px;
		font-size: 17px;
		font-weight: 600;
		color: var(--tint);
	}
</style>
