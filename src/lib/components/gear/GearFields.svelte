<script lang="ts">
	// Every catalogue field of a camera or a lens, as typed rows, in catalogue order: the names
	// first, then the numbers. Labels and units from the catalogue. Text uses the system keyboard;
	// a number field asks for the decimal one.
	import Section from '$lib/components/ios/Section.svelte';
	import { fieldsOf, type FieldDef } from '$lib/model/catalogue';
	import { fieldLabel, unitLabel } from '$lib/i18n/modelText';
	import type { GearScope } from '$lib/gear/names';
	import GearField from './GearField.svelte';
	import type { Snippet } from 'svelte';

	let {
		scope,
		values,
		errors,
		oncommit,
		onedit,
		footer,
		autofocus = false
	}: {
		scope: GearScope;
		values: Record<string, string>;
		errors: Record<string, string | undefined>;
		oncommit: (key: string, text: string) => void;
		onedit?: (key: string, text: string) => void;
		/** Under the numbers: what kind of lens this is. */
		footer?: string | Snippet;
		autofocus?: boolean;
	} = $props();

	const TEXT = new Set(['string']);
	const defs = $derived(fieldsOf(scope));
	const names = $derived(defs.filter((d) => TEXT.has(d.type)));
	const numbers = $derived(defs.filter((d) => !TEXT.has(d.type)));

	const PLACEHOLDER: Record<string, string> = {
		activeSensorPhysicalDimensions: '27.99 x 19.22',
		activeSensorResolution: '4608 x 3164',
		focalLength: '32',
		focalLengthMax: '—',
		anamorphicSqueeze: '1'
	};

	function attrs(def: FieldDef) {
		if (def.type === 'number' || def.type === 'rational') return { inputmode: 'decimal' as const, enterkeyhint: 'next' as const };
		if (def.key.endsWith('SerialNumber')) return { autocapitalize: 'characters' as const };
		return { autocapitalize: 'words' as const };
	}
</script>

{#snippet field(def: FieldDef, focus: boolean)}
	<GearField
		label={fieldLabel(def)}
		value={values[def.key] ?? ''}
		unit={def.type === 'number' || def.type === 'dimensions' ? unitLabel(def.unit) : undefined}
		error={errors[def.key]}
		placeholder={PLACEHOLDER[def.key]}
		oncommit={(text) => oncommit(def.key, text)}
		onedit={onedit && ((text) => onedit(def.key, text))}
		{...attrs(def)}
		data-key={def.key}
		autofocus={focus || undefined}
	/>
{/snippet}

<Section>
	{#each names as def, i (def.key)}{@render field(def, autofocus && i === 1)}{/each}
</Section>
<Section {footer}>
	{#each numbers as def (def.key)}{@render field(def, false)}{/each}
</Section>
