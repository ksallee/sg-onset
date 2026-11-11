<script lang="ts">
	// The setup check's report in words: entities found or what an admin must do, with the exact
	// name to give them; fields there, created, to create or waiting for an admin; permission
	// trouble. Fields are made only on Set Up Fields, a tap of the person.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { useSync } from '$lib/app/sync/controller.svelte';
	import { setupView, type FieldLine, type FieldStatus } from '$lib/app/sync/report';
	import { t } from '$lib/i18n/messages';

	const sync = useSync();
	const view = $derived(sync.state.report ? setupView(sync.state.report) : undefined);
	let showPresent = $state(false);

	const LISTED: FieldStatus[] = ['needsAdmin', 'missing', 'created', 'blocked', 'failed'];
	const statusText = $derived(sync.state.checking ? (sync.state.creatingFields ? t('sync.setup.creating') : t('sync.setup.checking')) : sync.state.ready ? t('sync.setup.ready') : view ? t('sync.setup.notReady') : t('sync.setup.unknown'));

	function entityText(line: NonNullable<typeof view>['entities'][number]): string {
		if (line.action === 'found') return t('sync.setup.entity.found');
		if (line.action === 'enable') return t('sync.setup.entity.enable', { name: line.displayName });
		if (line.action === 'switchOn') return t('sync.setup.entity.switchOn', { name: line.displayName });
		return t('sync.setup.entity.keepOne', { name: line.displayName, types: (line.candidates ?? []).join(', ') });
	}
	const fieldSub = (f: FieldLine) => [f.name, f.dataType, f.unique ? t('sync.setup.field.unique') : '', f.validTypes?.join(', ') ?? '', f.reason ?? ''].filter(Boolean).join(' · ');
</script>

<Section header={t('sync.setup.header')} footer={view?.permission ? t('sync.setup.permission') : view?.canSetUpFields ? t('sync.setup.fields.footer') : undefined}>
	<Row title={t('sync.setup.header')} detail={statusText} />
	<Row title={t('sync.setup.check')} onclick={() => void sync.check(false)} chevron={false} />
	{#if view?.canSetUpFields && !sync.state.checking}
		<Row title={t('sync.setup.fields')} onclick={() => void sync.check(true)} chevron={false} />
	{/if}
</Section>

{#if view}
	<Section header={t('sync.setup.entities')} footer={view.entitiesToFix > 0 ? t('sync.setup.entities.footer') : undefined}>
		{#each view.entities as line (line.scope)}
			<Row title={line.displayName} subtitle={line.entityType} detail={entityText(line)} />
		{/each}
	</Section>

	<Section header={t('sync.setup.fieldsHeader')}>
		<Row title={t('sync.setup.field.present')} detail={String(view.counts.present)} onclick={() => (showPresent = !showPresent)} chevron={false} />
		{#if showPresent}
			{#each view.fields.present as f (f.entity + f.name)}
				<Row title={t('sync.setup.field.line', { entity: f.entity, field: f.displayName })} subtitle={fieldSub(f)} />
			{/each}
		{/if}
		{#each LISTED as status (status)}
			{#if view.counts[status] > 0}
				<Row title={t(`sync.setup.field.${status}`)} detail={String(view.counts[status])} />
				{#each view.fields[status] as f (f.entity + f.name)}
					<Row title={t('sync.setup.field.line', { entity: f.entity, field: f.displayName })} subtitle={fieldSub(f)} />
				{/each}
			{/if}
		{/each}
	</Section>
{/if}
