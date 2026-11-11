<script lang="ts">
	// One take, opened from a take table: where it stands against its template, and every take
	// field typed and checked, saved as it is left. Read live, so an undo shows at once.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveRecord } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { t } from '$lib/i18n/messages';
	import { fieldLabel } from '$lib/i18n/modelText';
	import { fieldRefs } from '$lib/slates/fields';
	import { diverged } from '$lib/templates/divergence';
	import FieldRow from './FieldRow.svelte';
	import { useRefs } from './refs.svelte';
	import TemplateLink from './TemplateLink.svelte';

	let { open = $bindable(false), id }: { open?: boolean; id: string | undefined } = $props();

	const app = useApp();
	const refs = useRefs();
	const record = liveRecord('take', () => id);
	const take = $derived(record.value);
	const camera = $derived(take?.cameraSetupId ? (refs.names.get(take.cameraSetupId) ?? '') : '');
	const title = $derived(take ? (camera ? t('slates.take.title.camera', { take: take.take ?? '', camera }) : t('slates.take.title', { take: take.take ?? '' })) : '');
	const template = $derived(refs.template(take?.templateId));
	const changed = $derived(template && take ? new Set(diverged(template, take)) : new Set<string>());
	const FIELDS = fieldRefs('take');

	async function save(key: string, value: unknown) {
		const tk = take;
		if (!tk) return;
		const f = FIELDS.find((x) => x.key === key)!;
		await app.edit.set('take', tk, key, value, { key: 'edit.changed', params: { field: fieldLabel(f.def, f.end) } });
	}
</script>

<Sheet bind:open {title} done>
	{#if take}
		<TemplateLink table="take" record={take} what={title} />
		<Section header={t('slates.take.fields')}>
			{#each FIELDS as f (f.key)}
				<FieldRow
					scope="take"
					field={f}
					value={(take as Record<string, unknown>)[f.key]}
					units={settings.value.units}
					options={refs.options(f.def.key)}
					marker={changed.has(f.key)}
					onsave={(v) => save(f.key, v)}
				/>
			{/each}
		</Section>
	{:else if record.ready}
		<Section><Row title={t('slates.take.missing')} class="quiet" /></Section>
	{/if}
</Sheet>
