<script lang="ts">
	// One camera setup: its letter, its camera, its lens and its rig. The letter saves when the
	// field is left; the camera, the lens and the rig open a picker. It says plainly that a change is
	// for the takes to come: a take keeps the camera, lens and rig it was shot with (model decision
	// 2, #138).
	import { ArrowDown, ArrowUp } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { findField } from '$lib/model/catalogue';
	import type { Camera, CameraSetup, Lens } from '$lib/model/types';
	import { fieldLabel, issueText } from '$lib/i18n/modelText';
	import { t, tk } from '$lib/i18n/messages';
	import { readField } from '$lib/app/fieldEdit';
	import { cameraTitle, lensTitle } from '$lib/gear/names';
	import { rigLabel } from '$lib/gear/rigs';
	import { setupLabelTaken } from '$lib/gear/setups';
	import { settings } from '$lib/app/settings.svelte';
	import GearField from './GearField.svelte';
	import RigPicker from './RigPicker.svelte';

	let {
		setup,
		setups,
		cameras,
		lenses,
		onpick,
		onmove,
		ondelete
	}: {
		setup: CameraSetup;
		/** Every setup, sorted. */
		setups: CameraSetup[];
		cameras: Camera[];
		lenses: Lens[];
		onpick: (kind: 'camera' | 'lens') => void;
		/** Move this setup to an index of `setups`. */
		onmove: (to: number) => void;
		ondelete: () => void;
	} = $props();

	const index = $derived(setups.findIndex((s) => s.id === setup.id));

	const app = useApp();
	const labelDef = findField('cameraSetup', 'cameraLabel')!.def;
	const cameraDef = findField('cameraSetup', 'cameraId')!.def;
	const lensDef = findField('cameraSetup', 'lensId')!.def;
	const rigDef = findField('cameraSetup', 'cameraMount')!.def;
	const projectRigs = liveList('rig', () => setup.projectId);
	let rigOpen = $state(false);
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

	// The rig, as the lens: for the takes to come (#138).
	async function setRig(rig: string | undefined) {
		if (rig === setup.cameraMount) return;
		const label = setup.cameraLabel ?? '';
		await app.edit.set(
			'cameraSetup',
			setup,
			'cameraMount',
			rig,
			rig === undefined ? { key: 'gear.edit.cleared', params: { setup: label, field: fieldLabel(rigDef) } } : { key: 'gear.edit.rig', params: { setup: label, rig: rigLabel(rig, tk) } }
		);
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
	<Row title={fieldLabel(rigDef)} detail={setup.cameraMount ? rigLabel(setup.cameraMount, tk) : t('gear.setup.none')} chevron onclick={() => (rigOpen = true)} />
</Section>

<RigPicker bind:open={rigOpen} {setup} projectRigs={projectRigs.value.map((r) => r.name)} onpick={setRig} />

{#if setups.length > 1 && index >= 0}
	<Section footer={t('gear.order.footer', { n: index + 1, total: setups.length })}>
		{#if index > 0}
			<Row title={t('gear.order.up')} class="tint" onclick={() => onmove(index - 1)}>
				{#snippet leading()}<span class="icon" aria-hidden="true"><ArrowUp class="size-[19px]" strokeWidth={2.2} /></span>{/snippet}
			</Row>
		{/if}
		{#if index < setups.length - 1}
			<Row title={t('gear.order.down')} class="tint" onclick={() => onmove(index + 1)}>
				{#snippet leading()}<span class="icon" aria-hidden="true"><ArrowDown class="size-[19px]" strokeWidth={2.2} /></span>{/snippet}
			</Row>
		{/if}
	</Section>
{/if}

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
		box-shadow: inset 0 0 0 var(--status-ring) var(--tint);
		font-family: var(--font-rounded);
		font-size: 28px;
		font-weight: 700;
	}
	.badge.long {
		background: var(--fill);
		color: var(--label);
		box-shadow: none;
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		height: 29px;
		color: var(--tint);
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
