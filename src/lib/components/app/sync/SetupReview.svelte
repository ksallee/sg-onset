<script lang="ts">
	// The review before Set Up Fields, in place of the setup section: the site and Flow PT project,
	// the fields to create by entity (tap one to list them), the fields Flow PT adds, what this does
	// to the site, then Set Up Fields or Not Now. Plain words, no alarm colours. The view model is
	// app/sync/review.ts.
	import { onMount } from 'svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import type { SetupReview } from '$lib/app/sync/review';
	import { t } from '$lib/i18n/messages';

	let { review, onconfirm, onnotnow }: { review: SetupReview; onconfirm: () => void; onnotnow: () => void } = $props();

	let open = $state<Record<string, boolean>>({});
	let top: HTMLElement | undefined = $state();

	// The review takes the setup section's place: bring its start into view.
	onMount(() => top?.scrollIntoView({ block: 'start' }));
</script>

<div bind:this={top} class="review">
	<Section header={t('sync.review.header')} footer={t('sync.review.schema', { site: review.site })}>
		<Row title={t('sync.review.site')} detail={review.site} />
		<Row title={t('sync.review.project')} detail={review.project} />
	</Section>

	<Section footer={t('sync.review.fields.footer')}>
		<Row title={t('sync.review.fields')} detail={String(review.total)} />
		{#each review.groups as group (group.entity)}
			<Row title={group.entity} detail={String(group.fields.length)} onclick={() => (open[group.entity] = !open[group.entity])} chevron={false} />
			{#if open[group.entity]}
				{#each group.fields as f (f.name)}
					<Row title={f.displayName} subtitle={`${f.name} · ${f.dataType}`} />
				{/each}
			{/if}
		{/each}
	</Section>

	{#if review.reverse.length}
		<Section header={t('sync.review.reverse')} footer={t('sync.review.reverse.footer')}>
			{#each review.reverse as r (r.entity + r.name)}
				<Row title={t('sync.setup.field.line', { entity: r.entity, field: r.displayName })} subtitle={r.name} />
			{/each}
		</Section>
	{/if}

	<div class="actions">
		<Button variant="filled" size="large" full onclick={onconfirm}>{t('sync.review.confirm')}</Button>
		<Button variant="plain" size="large" full onclick={onnotnow}>{t('sync.review.notNow')}</Button>
	</div>
</div>

<style>
	.review {
		scroll-margin-top: 16px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 8px var(--page-margin, 16px) 24px;
	}
</style>
