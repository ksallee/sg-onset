<script lang="ts">
	// The take's note in the take sheet: a row of a Section that takes several lines, as long as the
	// note is. Return starts a new line. `value` is bound as it is typed; `onchange` fires when the
	// field is left, with the text trimmed, only when it changed: save there. The kit's InputRow is
	// one line; this is its many-line twin, kept here until the kit has one.
	let {
		label,
		value = $bindable(''),
		placeholder = '',
		onchange
	}: { label: string; value?: string; placeholder?: string; onchange?: (value: string) => void } = $props();

	// What the field held when it was entered: leaving it unchanged saves nothing.
	let committed = '';
	function commit() {
		const text = value.trim();
		if (text === committed) return;
		committed = text;
		onchange?.(text);
	}
</script>

<div class="note-field" role="listitem">
	<textarea
		aria-label={label}
		rows="4"
		autocomplete="off"
		autocapitalize="sentences"
		spellcheck="true"
		{placeholder}
		bind:value
		onfocus={() => (committed = value.trim())}
		onblur={commit}
	></textarea>
</div>

<style>
	.note-field {
		background: var(--group-bg, var(--cell));
	}
	textarea {
		display: block;
		width: 100%;
		min-height: calc(4 * 22px + 22px);
		/* As tall as the note, where the browser can; else it scrolls inside. */
		field-sizing: content;
		max-height: 60vh;
		padding: 11px 16px;
		background: transparent;
		color: var(--label);
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		resize: none;
		outline: none;
	}
	textarea::placeholder {
		color: var(--label-3);
	}
	textarea:focus-visible {
		box-shadow: inset 0 0 0 2px var(--focus);
	}
</style>
