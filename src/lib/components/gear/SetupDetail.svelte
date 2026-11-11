<script lang="ts">
	// One camera setup: its letter, its camera and its lens. The letter saves when the field is
	// left; the camera and the lens open a picker. It says plainly that a change is for the takes
	// to come: a take keeps the camera and lens it was shot with (model decision 2).
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { findField } from '$lib/model/catalogue';
	import type { Camera, CameraSetup, Lens } from '$lib/model/types';
	import { fieldLabel, issueText } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { readField } from '$lib/app/fieldEdit';
	import { cameraTitle, lensTitle } from '$lib/gear/names';
	import { setupLabelTaken } from '$lib/gear/setups';
	import { settings } from '$lib/app/settings.svelte';
	import GearField from './GearField.svelte';

	let {
		setup,
		setups,
		cameras,
		lenses,
		onpick,
		ondelete
	}: {
		setup: CameraSetup;
		setups: CameraSetup[];
		cameras: Camera[];
		lenses: Lens[];
		onpick: (kind: 'camera' | 'lens') => void;
		ondelete: () => void;
	} = $props();

	const app = useApp();
	const labelDef = findField('cameraSetup', 'cameraLabel')!.def;
	const cameraDef = findField('cameraSetup', 'cameraId')!.def;
	const lensDef = findField('cameraSetup', 'lensId')!.def;
	let error = $state<string | undefined>();
	let shown = '';
	$effect.pre(() => {
		if (setup.id !== shown) {
			shown = setup.id;
			error = undefined;
		}
	});

	const body = $derived(cameras.find((c) => c.id === setup.cameraId));
	const lens = $derived(lenses.find((l) => l.id === setup.lensId));
	const short = $derived((setup.cameraLabel ?? '').trim().length <= 2);

	async function rename(text: string) {
		const read = readField('cameraSetup', 'cameraLabel', text, settings.value.units);
		if (!read.ok) return void (error = issueText(read.issue));
		if (setupLabelTaken(setups, text, setup.id)) return void (error = t('gear.label.taken'));
		error = undefined;
		await app.edit.set('cameraSetup', setup, 'cameraLabel', read.value, { key: 'edit.changed', params: { field: fieldLabel(labelDef) } });
	}
</script>

<div class="detail-head">
	<span class="badge" class:long={!short} aria-hidden="true">{short ? setup.cameraLabel : (setup.cameraLabel ?? '').slice(0, 1)}</span>
	<div class="words">
		<p class="scope">{tk('scope.cameraSetup')}</p>
		<h2>{setup.cameraLabel}</h2>
	</div>
</div>

<Section>
	<GearField label={fieldLabel(labelDef)} value={setup.cameraLabel ?? ''} {error} oncommit={rename} autocapitalize="words" enterkeyhint="done" />
</Section>

<Section footer={t('gear.setup.takes')}>
	<Row title={fieldLabel(cameraDef)} detail={body ? cameraTitle(body) || t('gear.untitled') : t('gear.setup.none')} chevron onclick={() => onpick('camera')} />
	<Row title={fieldLabel(lensDef)} detail={lens ? lensTitle(lens) || t('gear.untitled') : t('gear.setup.none')} chevron onclick={() => onpick('lens')} />
</Section>

<Section footer={t('gear.delete.footer')}>
	<Row title={t('gear.delete.cameraSetup')} destructive onclick={ondelete} />
</Section>

<style>
	.detail-head {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 4px var(--page-margin, 16px) 16px;
	}
	.badge {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: var(--tint-solid);
		color: var(--on-tint-solid);
		font-family: var(--font-rounded);
		font-size: 28px;
		font-weight: 700;
	}
	.badge.long {
		background: var(--fill);
		color: var(--label);
	}
	.words {
		min-width: 0;
	}
	.scope {
		font-size: 13px;
		line-height: 18px;
		text-transform: uppercase;
		color: var(--label-2);
	}
	h2 {
		font-size: 24px;
		line-height: 30px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
</style>
