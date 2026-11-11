<script lang="ts">
	// Slates: the slates of the project by shoot day, the current day first. A new slate is
	// blank and lands on the current day. Swipe a slate to delete it, with its takes; Undo brings
	// them back.
	import { Clapperboard, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ios/Button.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import InputRow from '$lib/components/ios/InputRow.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import ContextBar from '$lib/components/app/ContextBar.svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatDate } from '$lib/app/format';
	import { live, liveList } from '$lib/app/live.svelte';
	import { t } from '$lib/i18n/messages';
	import type { ShootDay, Slate } from '$lib/model/types';
	import { slatesByDay, takeCount, type DayGroup } from '$lib/slates/list';
	import { blankSlate, nextSlateName, slateNameTaken } from '$lib/slates/naming';

	const app = useApp();
	const current = useCurrent();
	// The slates of every day of the project, and every take, to count them.
	const slates = live<Slate[]>(
		['slate'],
		async (store) => {
			const days = current.shootDays;
			return (await Promise.all(days.map((d) => store.list('slate', d.id)))).flat();
		},
		[]
	);
	const takes = liveList('take');
	const groups = $derived(slatesByDay(current.shootDays, slates.value, takes.value, current.shootDay?.id));
	const none = $derived(slates.ready && slates.value.length === 0);

	const dayTitle = (day: ShootDay) => {
		const n = dayName(day);
		return t('context.day.line', { day: t(n.key, n.params), date: formatDate(day.shootDate) });
	};
	const header = (group: DayGroup) => (group.current ? `${dayTitle(group.day)} · ${t('slates.day.current')}` : dayTitle(group.day));
	const about = (slate: Slate) => [slate.sceneNumber ? t('slates.scene', { scene: slate.sceneNumber }) : '', slate.description].filter(Boolean).join(' · ');
	const count = (n: number) => {
		const c = takeCount(n);
		return t(c.key, c.params);
	};

	let creating = $state(false);
	let name = $state('');
	const taken = $derived(slateNameTaken(current.slates, name));

	function open() {
		name = nextSlateName(current.slates);
		creating = true;
	}
	async function create(event?: SubmitEvent) {
		event?.preventDefault();
		const day = current.shootDay;
		if (!day || name.trim() === '' || taken) return;
		const slate = blankSlate(app.newId(), day.id, name);
		await app.edit.create('slate', slate, { label: { key: 'edit.created', params: { what: t('slates.slate', { slate: slate.slateUID ?? '' }) } } });
		creating = false;
		await goto(`/slates/${slate.id}`);
	}
	const remove = (slate: Slate) => app.edit.removeTree('slate', slate.id, { key: 'edit.removed', params: { what: t('slates.slate', { slate: slate.slateUID ?? '' }) } });
</script>

<svelte:head><title>{t('slates.title')} · {t('app.name')}</title></svelte:head>

<Page>
	<NavBar title={t('slates.title')} large>
		{#snippet trailing()}
			<Button variant="plain" onclick={open} disabled={!current.shootDay}><Plus class="size-[20px]" strokeWidth={2.2} />{t('slates.new')}</Button>
		{/snippet}
	</NavBar>
	<ContextBar />

	{#if none}
		<EmptyState icon={Clapperboard} title={t('slates.empty')} message={t('slates.empty.message')}>
			{#snippet action()}<Button variant="filled" onclick={open} disabled={!current.shootDay}>{t('slates.new')}</Button>{/snippet}
		</EmptyState>
	{:else if slates.ready}
		{#each groups as group (group.day.id)}
			<Section header={header(group)}>
				{#each group.slates as row (row.slate.id)}
					<Row
						title={row.slate.slateUID ?? ''}
						subtitle={about(row.slate) || undefined}
						detail={count(row.takes)}
						href="/slates/{row.slate.id}"
						swipe={[{ label: t('common.delete'), destructive: true, run: () => remove(row.slate) }]}
					/>
				{:else}
					<Row title={t('slates.day.empty')} class="quiet" />
				{/each}
			</Section>
		{/each}
	{/if}

	<Sheet bind:open={creating} title={t('slates.new.title')}>
		{#snippet leading()}<Button variant="plain" onclick={() => (creating = false)}>{t('common.cancel')}</Button>{/snippet}
		{#snippet trailing()}<Button variant="plain" class="strong" onclick={() => create()} disabled={name.trim() === '' || taken}>{t('common.create')}</Button>{/snippet}
		<form onsubmit={create} novalidate>
			<Section footer={current.shootDay ? t('slates.new.footer', { day: dayTitle(current.shootDay) }) : undefined}>
				<InputRow
					label={t('slates.new.name')}
					bind:value={name}
					placeholder={t('slates.new.placeholder')}
					autocapitalize="characters"
					enterkeyhint="done"
					error={taken ? t('slates.new.taken') : undefined}
				/>
			</Section>
		</form>
	</Sheet>
</Page>
