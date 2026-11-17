<script lang="ts">
	// The reference log of one slate: what was captured for it on other devices, in the order
	// logged, then a row of kinds to add one. An HDRI 360, a 360 video or an HDR reference logged on
	// another slate of its lighting setup shows here too (#107, lib/references/lighting.ts). Adding is
	// two taps: a kind, then the name, which is suggested after the last reference of that kind in
	// the project (lib/references). A row opens the reference; a swipe deletes it. Read live, so an
	// undo shows at once.
	import { Plus } from '@lucide/svelte';
	import Chip from '$lib/components/ios/Chip.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { live, liveList } from '$lib/app/live.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { Reference, Slate } from '$lib/model/types';
	import { removeReference } from '$lib/references/edit';
	import { kindChoices, kindLabel } from '$lib/references/kinds';
	import { shownBySlate } from '$lib/references/lighting';
	import { referenceDetail } from '$lib/references/log';
	import NewReferenceSheet from './NewReferenceSheet.svelte';
	import ReferenceSheet from './ReferenceSheet.svelte';

	let { slate }: { slate: Slate } = $props();

	const app = useApp();
	const current = useCurrent();
	const kinds = liveList('referenceKind', () => current.project?.id);
	// The slates and references of the project: the lighting setups say what this slate shows, and
	// the next name is suggested from every reference.
	const project = live<{ slates: Slate[]; refs: Reference[] }>(
		['reference', 'slate', 'shootDay'],
		async (store) => {
			const projectId = current.project?.id;
			if (!projectId) return { slates: [], refs: [] };
			const [days, slates, refs] = await Promise.all([store.list('shootDay', projectId), store.list('slate'), store.list('reference')]);
			const dayIds = new Set(days.map((d) => d.id));
			const mine = slates.filter((s) => dayIds.has(s.shootDayId));
			const slateIds = new Set(mine.map((s) => s.id));
			return { slates: mine, refs: refs.filter((r) => slateIds.has(r.slateId)) };
		},
		{ slates: [], refs: [] }
	);

	const label = (kind: string) => kindLabel(kind, tk);
	const references = $derived(shownBySlate(project.value.slates, project.value.refs).get(slate.id) ?? []);
	const choices = $derived(kindChoices(kinds.value.map((k) => k.name)));

	let adding = $state(false);
	let kind = $state('');
	function add(k: string) {
		kind = k;
		adding = true;
	}

	let editing = $state(false);
	let editId = $state<string | undefined>();
	function open(id: string) {
		editId = id;
		editing = true;
	}

	async function remove(r: Reference) {
		await removeReference(app, r, { key: 'edit.removed', params: { what: `${tk('scope.reference')} ${r.name ?? ''}` } });
	}
</script>

<Section header={t('references.header')} footer={t('references.footer')}>
	{#each references as r (r.id)}
		<Row title={r.name ?? ''} subtitle={referenceDetail(r, label)} chevron onclick={() => open(r.id)} swipe={[{ label: t('common.delete'), destructive: true, run: () => void remove(r) }]} />
	{:else}
		<Row title={t('references.none')} class="quiet" />
	{/each}
	<div class="kinds" role="listitem">
		<div class="scroll" role="group" aria-label={t('references.add')}>
			{#each choices as k (k)}
				<Chip label={t('references.add.kind', { kind: label(k) })} onclick={() => add(k)}>
					<span class="chip"><Plus class="size-[17px]" strokeWidth={2.4} aria-hidden="true" />{label(k)}</span>
				</Chip>
			{/each}
		</div>
	</div>
</Section>

<NewReferenceSheet bind:open={adding} {kind} slateId={slate.id} project={project.value.refs} />
<ReferenceSheet bind:open={editing} id={editId} kinds={choices} />

<style>
	.kinds {
		background: var(--group-bg, var(--cell));
		box-shadow: inset 0 var(--hairline) 0 var(--separator);
	}
	.scroll {
		display: flex;
		gap: 8px;
		padding: 10px 16px;
		overflow-x: auto;
		scrollbar-width: none;
		--chip-font: 16px;
	}
	.scroll::-webkit-scrollbar {
		display: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
