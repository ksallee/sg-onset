<script lang="ts">
	// What is still missing on the day's takes, one row per take. A tap opens the take on Shoot.
	import { CircleCheck, TriangleAlert } from '@lucide/svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import { t, tk } from '$lib/i18n/messages';
	import type { TodoItem } from '$lib/wrap/summary';

	let { todo, onopen }: { todo: TodoItem[]; onopen: (item: TodoItem) => void } = $props();

	const title = (i: TodoItem) => (i.cameraLetter ? t('wrap.todo.takeCam', { slate: i.slate, take: i.take, camera: i.cameraLetter }) : t('wrap.todo.take', { slate: i.slate, take: i.take }));
	const what = (i: TodoItem) => i.kinds.map((k) => tk(`wrap.todo.${k}`)).join(' · ');
</script>

<Section header={t('wrap.todo.header')} footer={todo.length ? t('wrap.todo.footer') : undefined}>
	{#each todo as item (item.takeId)}
		<Row title={title(item)} subtitle={what(item)} chevron onclick={() => onopen(item)}>
			{#snippet leading()}<Tile icon={TriangleAlert} color="var(--warning)" />{/snippet}
		</Row>
	{:else}
		<Row title={t('wrap.todo.none')} subtitle={t('wrap.todo.none.sub')}>
			{#snippet leading()}<Tile icon={CircleCheck} color="var(--good)" />{/snippet}
		</Row>
	{/each}
</Section>
