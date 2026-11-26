<script lang="ts">
	// One field of an entry or a template, as a row of a Section, typed as the catalogue says:
	// text with the system keyboard (numbers get the decimal one) and its unit after it; a switch
	// for yes or no (or a picker with "Not set" in a template, `tri`); a picker for an option, a
	// linked entry, or text picked from a list (`options`: the rigs, #138); a chip per option for a list of options (the plates at a take's tail), each
	// on or off with a tap. The text follows the stored value, so an undo shows at once. A typed value is
	// read and checked (`readField`) when the field is left or Return is pressed: saved when it is
	// good, the issue said under the row when not. `marker`: the value differs from the template.
	// `suggestions`: for a list, the values to offer as chips while one is typed (the Shot codes of
	// the Flow PT project for a slate's VFX shots); a pick saves at once and keeps the keyboard up.
	import Chip from '$lib/components/ios/Chip.svelte';
	import type { Scope } from '$lib/model/catalogue';
	import { formatField } from '$lib/model/fieldText';
	import type { UnitSystem } from '$lib/model/length';
	import { readField } from '$lib/app/fieldEdit';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import { t } from '$lib/i18n/messages';
	import { fieldLabel, issueText, optionLabel, unitLabel } from '$lib/i18n/modelText';
	import type { FieldRef } from '$lib/slates/fields';
	import { pickCode, suggestCodes } from '$lib/slates/shotSuggest';

	let {
		scope,
		field,
		value,
		units,
		options = [],
		tri = false,
		marker = false,
		placeholder,
		suggestions,
		check,
		onlive,
		onsave
	}: {
		scope: Scope;
		field: FieldRef;
		value: unknown;
		units: UnitSystem;
		/** The entries a ref can point at, or the values a text field is picked from. */
		options?: { value: string; label: string }[];
		/** A yes-or-no field that may also be left unset (a template). */
		tri?: boolean;
		marker?: boolean;
		placeholder?: string;
		/** For a list: the values to offer while one is typed, and what they are. None: free text. */
		suggestions?: { label: string; values: readonly string[] };
		/** A check of the value beyond the catalogue's: the message, or nothing. */
		check?: (value: unknown) => string | undefined;
		/** Told on every keystroke whether the text reads, and as what: a form that saves on a button. */
		onlive?: (read: { ok: true; value: unknown } | { ok: false }) => void;
		onsave: (value: unknown) => unknown;
	} = $props();

	const id = $props.id();
	const def = $derived(field.def);
	const label = $derived(fieldLabel(def, field.end));
	const kind = $derived(
		def.type === 'boolean' ? (tri ? 'pick' : 'switch') : def.type === 'enum' || def.type === 'ref' || (def.type === 'string' && options.length) ? 'pick' : def.type === 'stringList' && def.options ? 'chips' : 'text'
	);
	const numeric = $derived(['integer', 'number', 'length', 'rational'].includes(def.type));
	const unit = $derived(def.unit && def.type !== 'length' ? unitLabel(def.unit) : '');

	// The text follows the stored value; what is typed stays until it is saved or refused.
	const format = (v: unknown) => (v === undefined ? '' : formatField(def, v, units));
	let text = $state('');
	let shown = '';
	let error = $state<string | undefined>();
	let focused = $state(false);
	const offered = $derived(focused && suggestions?.values.length && def.type === 'stringList' ? suggestCodes(text, suggestions.values) : []);
	$effect(() => {
		const f = format(value);
		if (f !== shown) {
			text = f;
			shown = f;
			error = undefined;
		}
	});

	async function commit() {
		const typed = text.trim();
		if (typed === shown && !error) return;
		const read = readField(scope, field.key, typed, units);
		if (!read.ok) return void (error = issueText(read.issue));
		const problem = check?.(read.value);
		if (problem) return void (error = problem);
		error = undefined;
		await onsave(read.value);
	}

	// A press on a chip keeps the focus in the field: the keyboard stays up, and the half-typed
	// code is not saved on the way. On `mousedown`, which a tap sends too: cancelling
	// `pointerdown` would cost the tap its click in WebKit, and a drag of the row its scroll.
	function keepFocus(node: HTMLElement) {
		const stay = (e: Event) => e.preventDefault();
		node.addEventListener('mousedown', stay);
		return () => node.removeEventListener('mousedown', stay);
	}

	async function pick(code: string) {
		text = pickCode(text, code);
		await commit();
	}

	function live(e: Event) {
		if (!onlive) return;
		// The event's own text: the binding may not have run yet.
		const read = readField(scope, field.key, (e.currentTarget as HTMLInputElement).value.trim(), units);
		onlive(read.ok && !check?.(read.value) ? { ok: true, value: read.value } : { ok: false });
	}

	const choices = $derived.by(() => {
		if (def.type === 'boolean')
			return [
				{ value: 'true', label: t('slates.field.yes') },
				{ value: 'false', label: t('slates.field.no') }
			];
		if (def.type === 'enum') return (def.options ?? []).map((o) => ({ value: o, label: optionLabel(def, o) }));
		return options;
	});
	// A list of options: each chip puts its option in or takes it out; none left is no value.
	const held = $derived(Array.isArray(value) ? (value as unknown[]) : []);
	function flip(option: string) {
		const next = (def.options ?? []).filter((o) => (o === option ? !held.includes(o) : held.includes(o)));
		void onsave(next.length ? next : undefined);
	}

	const picked = $derived(value === undefined ? '' : String(value));
	function choose(raw: string) {
		if (raw === '') return void onsave(undefined);
		void onsave(def.type === 'boolean' ? raw === 'true' : raw);
	}
</script>

<div class="field-row" class:invalid={!!error} role="listitem">
	<svelte:element this={kind === 'switch' || kind === 'chips' ? 'div' : 'label'} class="cell" for={kind === 'switch' || kind === 'chips' ? undefined : id}>
		<span class="label">
			{#if marker}<span class="marker" aria-hidden="true"></span><span class="sr-only">{t('slates.link.marker')}: </span>{/if}{label}
		</span>
		{#if kind === 'switch'}
			<span class="end"><Toggle checked={value === true} label={label} onchange={(v) => onsave(v ? true : undefined)} /></span>
		{:else if kind === 'chips'}
			<span class="chips" role="group" aria-label={label}>
				{#each def.options ?? [] as o (o)}<Chip on={held.includes(o)} onclick={() => flip(o)}>{optionLabel(def, o)}</Chip>{/each}
			</span>
		{:else if kind === 'pick'}
			<select {id} class="pick" class:empty={picked === ''} value={picked} onchange={(e) => choose(e.currentTarget.value)}>
				<option value="">{tri && def.type === 'boolean' ? t('slates.field.unset') : t('slates.field.none')}</option>
				{#each choices as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
				{#if picked !== '' && !choices.some((c) => c.value === picked)}<option value={picked}>{picked}</option>{/if}
			</select>
		{:else}
			<input
				{id}
				type="text"
				inputmode={numeric ? 'decimal' : 'text'}
				autocomplete="off"
				autocapitalize={def.type === 'string' && (field.key === 'slateUID' || field.key === 'sceneNumber' || field.key === 'setup') ? 'characters' : 'sentences'}
				spellcheck="false"
				enterkeyhint="done"
				aria-invalid={!!error || undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				{placeholder}
				bind:value={text}
				oninput={live}
				onfocus={() => (focused = true)}
				onblur={() => {
					focused = false;
					void commit();
				}}
				onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
			/>
			{#if unit && text !== ''}<span class="unit" aria-hidden="true">{unit}</span>{/if}
		{/if}
	</svelte:element>
	{#if offered.length}
		<div class="suggest" role="group" aria-label={suggestions?.label} {@attach keepFocus}>
			{#each offered as code (code)}<Chip onclick={() => void pick(code)}>{code}</Chip>{/each}
		</div>
	{/if}
	{#if error}<p class="error" id="{id}-error" role="alert">{error}</p>{/if}
</div>

<style>
	.field-row {
		position: relative;
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 calc(-1 * var(--hairline)) 0 var(--separator);
	}
	.field-row:last-child {
		box-shadow: none;
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
	}
	.label {
		position: relative;
		flex: none;
		width: 38%;
		max-width: 190px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.marker {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 6px;
		border-radius: 50%;
		background: var(--changed);
		vertical-align: 1px;
	}
	input,
	.pick {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		min-height: var(--touch, 44px);
		background: transparent;
		color: var(--label);
		font-size: 17px;
		letter-spacing: -0.43px;
		outline: none;
	}
	input::placeholder {
		color: var(--label-3);
	}
	.pick {
		appearance: none;
		-webkit-appearance: none;
		text-align: left;
		cursor: pointer;
		color: var(--tint);
	}
	.pick.empty {
		color: var(--label-3);
	}
	.pick option {
		color: initial;
	}
	.end {
		margin-left: auto;
		margin-block: -6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		margin-left: auto;
		padding-block: 6px;
	}
	.unit {
		flex: none;
		color: var(--label-2);
		font-size: 17px;
	}
	.cell:focus-within .label {
		color: var(--tint);
	}
	.invalid .label {
		color: var(--destructive);
	}
	.suggest {
		display: flex;
		gap: 8px;
		padding: 0 16px 10px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.suggest::-webkit-scrollbar {
		display: none;
	}
	.error {
		padding: 0 16px 10px;
		font-size: 13px;
		line-height: 18px;
		color: var(--destructive);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
