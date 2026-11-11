<script lang="ts">
	// A new slate on the current shoot day: blank, or from a slate template (and linked to it).
	// The name is suggested from the template's scene, or after the day's last slate
	// (slates/naming.ts), and can be typed over.
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatDate } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import { createFromTemplate } from '$lib/model/template';
	import { blankSlate, nextSlateName, slateNameTaken } from '$lib/slates/naming';
	import { useRefs } from './refs.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const app = useApp();
	const current = useCurrent();
	const refs = useRefs();
	const choices = $derived(refs.templates.filter((tp) => tp.scope === 'slate'));

	let templateId = $state('');
	let name = $state('');
	let typed = false;
	const template = $derived(refs.template(templateId || undefined));
	const suggestion = $derived(nextSlateName(current.slates, (template?.values as { sceneNumber?: string } | undefined)?.sceneNumber));
	const taken = $derived(slateNameTaken(current.slates, name));
	const dayLine = $derived.by(() => {
		const d = current.shootDay;
		if (!d) return '';
		const n = dayName(d);
		return t('context.day.line', { day: t(n.key, n.params), date: formatDate(d.shootDate) });
	});

	// Each time it opens: the suggestion, until something is typed.
	$effect(() => {
		if (open) {
			typed = false;
			name = suggestion;
		}
	});
	$effect(() => {
		const s = suggestion;
		if (!typed) name = s;
	});

	async function create(event?: SubmitEvent) {
		event?.preventDefault();
		const day = current.shootDay;
		if (!day || name.trim() === '' || taken) return;
		const blank = blankSlate(app.newId(), day.id, name);
		const slate = template ? createFromTemplate(template, blank) : blank;
		await app.edit.create('slate', slate, { label: { key: 'edit.created', params: { what: t('slates.slate', { slate: slate.slateUID ?? '' }) } } });
		open = false;
		await goto(`/slates/${slate.id}`);
	}
</script>

<Sheet bind:open title={t('slates.new.title')}>
	{#snippet leading()}<Button variant="plain" onclick={() => (open = false)}>{t('common.cancel')}</Button>{/snippet}
	{#snippet trailing()}<Button variant="plain" class="strong" onclick={() => create()} disabled={name.trim() === '' || taken}>{t('common.create')}</Button>{/snippet}
	<form onsubmit={create} novalidate>
		<Section footer={dayLine ? t('slates.new.footer', { day: dayLine }) : undefined}>
			<InputRow
				label={t('slates.new.name')}
				bind:value={name}
				oninput={() => (typed = true)}
				placeholder={t('slates.new.placeholder')}
				autocapitalize="characters"
				enterkeyhint="done"
				error={taken ? t('slates.new.taken') : undefined}
			/>
		</Section>
		<Section footer={t('slates.new.template.footer')}>
			<div class="pick" role="listitem">
				<label class="cell">
					<span class="label">{t('slates.new.template')}</span>
					<select bind:value={templateId} disabled={choices.length === 0}>
						<option value="">{t('slates.new.blank')}</option>
						{#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</label>
			</div>
		</Section>
	</form>
</Sheet>

<style>
	.pick {
		background: var(--group-bg, var(--cell));
	}
	.cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch, 44px);
		padding: 0 16px;
	}
	.label {
		flex: none;
		width: 34%;
		max-width: 160px;
		font-size: 17px;
		color: var(--label);
	}
	select {
		flex: 1;
		min-width: 0;
		min-height: var(--touch, 44px);
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		color: var(--tint);
		font-size: 17px;
		outline: none;
	}
	select:disabled {
		color: var(--label-3);
	}
</style>
