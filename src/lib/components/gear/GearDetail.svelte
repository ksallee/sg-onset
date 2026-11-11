<script lang="ts">
	// One camera or one lens, every field ready to edit. Each field saves when it is left, through
	// the editor, so Undo takes it back; a value that does not read stays in the field with the
	// catalogue's reason under it, and nothing is saved. A lens says plainly whether it is a prime
	// or a zoom, from its focal range. Duplicate and Delete at the foot, no confirmation: Undo.
	import { Camera as CameraIcon } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { fieldsOf, findField } from '$lib/model/catalogue';
	import type { Camera, CameraSetup, Lens } from '$lib/model/types';
	import { fieldLabel, issueText } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { gearTitle, lensKind, type GearScope } from '$lib/gear/names';
	import { checkEdit, fieldText } from '$lib/gear/records';
	import { cameraLine, focalBadge, focalText, lensLine } from '$lib/gear/text';
	import GearFields from './GearFields.svelte';

	let {
		scope,
		record,
		usedBy,
		onduplicate,
		ondelete,
		onsetup
	}: {
		scope: GearScope;
		record: Camera | Lens;
		usedBy: CameraSetup[];
		onduplicate: () => void;
		ondelete: () => void;
		onsetup: (setup: CameraSetup) => void;
	} = $props();

	const app = useApp();
	const units = $derived(settings.value.units);
	let errors = $state<Record<string, string | undefined>>({});
	// Another record: its own problems, none yet.
	let shown = '';
	$effect.pre(() => {
		if (record.id !== shown) {
			shown = record.id;
			errors = {};
		}
	});

	const values = $derived(Object.fromEntries(fieldsOf(scope).map((d) => [d.key, fieldText(scope, record, d.key, units)])));
	const title = $derived(gearTitle(scope, record) || t('gear.untitled'));
	const line = $derived(scope === 'camera' ? cameraLine(record as Camera) : lensLine(record as Lens));
	const kind = $derived(scope === 'lens' ? lensKind(record as Lens) : undefined);
	const kindLine = $derived(kind ? t(`gear.lens.${kind}`, { focal: focalText(record as Lens) }) : undefined);

	async function commit(key: string, text: string) {
		const checked = checkEdit(scope, record, key, text, units);
		if (!checked.ok) {
			errors = { ...errors, [key]: issueText(checked.issue) };
			return;
		}
		// The pair of focal lengths is checked together: fixing one clears the other's problem.
		const { [key]: _, ...rest } = errors;
		if (key === 'focalLength' || key === 'focalLengthMax') delete rest.focalLength, delete rest.focalLengthMax;
		errors = rest;
		const def = findField(scope, key)!.def;
		await app.edit.set(scope, record, key, checked.value, { key: 'edit.changed', params: { field: fieldLabel(def) } });
	}
</script>

<div class="detail-head">
	{#if scope === 'camera'}
		<span class="mark" aria-hidden="true"><CameraIcon class="size-[26px]" strokeWidth={1.8} /></span>
	{:else}
		<span class="mark lens num" class:zoom={kind === 'zoom'} class:small={kind === 'zoom'} aria-hidden="true">{focalBadge(record as Lens)}</span>
	{/if}
	<div class="words">
		<p class="scope">{kind && kind !== 'unknown' ? `${tk(`scope.${scope}`)} · ${t(`gear.kind.${kind}`)}` : tk(`scope.${scope}`)}</p>
		<h2>{title}</h2>
		{#if line}<p class="line">{line}</p>{/if}
	</div>
</div>

<GearFields {scope} {values} {errors} oncommit={commit} footer={kindLine} />

{#if usedBy.length}
	<Section header={t('gear.usedBy')} footer={t('gear.setup.takes')}>
		{#each usedBy as setup (setup.id)}
			<Row title={setup.cameraLabel ?? ''} chevron onclick={() => onsetup(setup)} />
		{/each}
	</Section>
{/if}

<Section footer={t('gear.duplicate.footer')}>
	<Row title={t('gear.duplicate')} class="tint" onclick={onduplicate} />
</Section>
<Section footer={t('gear.delete.footer')}>
	<Row title={t(scope === 'camera' ? 'gear.delete.camera' : 'gear.delete.lens')} destructive onclick={ondelete} />
</Section>

<style>
	.detail-head {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 4px var(--page-margin, 16px) 16px;
	}
	.mark {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: var(--fill-2);
		color: var(--label);
		font-family: var(--font-rounded);
		font-size: 26px;
		font-weight: 700;
	}
	.mark.small {
		width: auto;
		min-width: 56px;
		padding: 0 10px;
		font-size: 19px;
	}
	.mark.zoom {
		background: var(--tint-fill);
		box-shadow: inset 0 0 0 var(--status-ring) var(--tint);
		color: var(--tint);
	}
	.words {
		min-width: 0;
	}
	.scope {
		font-size: 13px;
		line-height: 18px;
		text-transform: uppercase;
		letter-spacing: -0.08px;
		color: var(--label-2);
	}
	h2 {
		font-size: 24px;
		line-height: 30px;
		font-weight: 700;
		letter-spacing: 0.2px;
		overflow-wrap: anywhere;
	}
	.line {
		font-size: 15px;
		line-height: 20px;
		color: var(--label-2);
	}
</style>
