<script lang="ts">
	// Picks the project and the shoot day, and starts a new one of either. A new day starts
	// today, numbered after the last; a new project goes through the first-run page.
	import { goto } from '$app/navigation';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { createShootDay } from '$lib/app/actions';
	import { useApp } from '$lib/app/app.svelte';
	import { dayName } from '$lib/app/context';
	import { useCurrent } from '$lib/app/current.svelte';
	import { formatDate } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import type { ShootDay } from '$lib/model/types';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const app = useApp();
	const current = useCurrent();

	const name = (day: ShootDay) => {
		const n = dayName(day);
		return t(n.key, n.params);
	};
	const where = (day: ShootDay) => [formatDate(day.shootDate), day.cameraUnit, day.location].filter(Boolean).join(' · ');

	async function newDay() {
		const project = current.project;
		if (!project) return;
		const day = await createShootDay(app, project.id, current.shootDays, t('scope.shootDay'));
		current.select({ shootDayId: day.id });
	}
</script>

<Sheet bind:open title={t('context.title')} done={t('common.done')}>
	<Section header={t('context.projects')}>
		{#each current.projects as project (project.id)}
			<Row title={project.name ?? ''} checked={project.id === current.project?.id} onclick={() => current.select({ projectId: project.id })} />
		{/each}
		<Row
			title={t('context.newProject')}
			class="tint"
			onclick={() => {
				open = false;
				void goto('/welcome');
			}}
		/>
	</Section>

	<Section header={t('context.days')} footer={t('context.newDay.footer')}>
		{#each current.shootDays as day (day.id)}
			<Row title={name(day)} subtitle={where(day)} checked={day.id === current.shootDay?.id} onclick={() => current.select({ shootDayId: day.id })} />
		{:else}
			<Row title={t('context.days.none')} />
		{/each}
		<Row title={t('context.newDay')} class="tint" onclick={newDay} />
	</Section>
</Sheet>
