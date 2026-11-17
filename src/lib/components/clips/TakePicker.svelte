<script lang="ts">
	// Puts one clip of the import on a take of the day, or on none. The day's takes by slate, each
	// with the time it started and the clip it holds in the import now. Picking closes the sheet.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { formatTime } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import type { Clip } from '$lib/clips/clips';
	import type { DayLine, PreviewRow } from '$lib/clips/preview';

	let {
		open = $bindable(false),
		clip,
		current,
		lines,
		rows,
		onpick
	}: {
		open?: boolean;
		clip: Clip | undefined;
		/** The take the clip is on now. */
		current: string | undefined;
		lines: readonly DayLine[];
		rows: readonly PreviewRow[];
		onpick: (takeId: string | null) => void;
	} = $props();

	/** The day's lines by slate, in the day's order. */
	const groups = $derived.by(() => {
		const out: { slate: DayLine['slate']; lines: DayLine[] }[] = [];
		for (const line of lines) {
			const last = out.at(-1);
			if (last?.slate.id === line.slate.id) last.lines.push(line);
			else out.push({ slate: line.slate, lines: [line] });
		}
		return out;
	});
	const holder = $derived(new Map(rows.filter((r) => r.match.takeId).map((r) => [r.match.takeId!, r.clip.name])));

	const title = (line: DayLine) => (line.camera ? t('clips.pick.takeCam', { take: line.take.take ?? '', camera: line.camera }) : t('clips.pick.take', { take: line.take.take ?? '' }));
	function subtitle(line: DayLine): string {
		const held = holder.get(line.take.id);
		return [formatTime(line.take.startedAt) || t('clips.pick.notStarted'), held && held !== clip?.name ? t('clips.pick.has', { clip: held }) : ''].filter(Boolean).join(' · ');
	}
</script>

<Sheet bind:open title={clip?.name ?? ''} done>
	<Section footer={t('clips.pick.none.footer')}>
		<Row title={t('clips.pick.none')} checked={!current} onclick={() => onpick(null)} />
	</Section>
	{#each groups as group (group.slate.id)}
		<Section header={t('clips.pick.slate', { slate: group.slate.slateUID ?? '' })}>
			{#each group.lines as line (line.take.id)}
				<Row title={title(line)} subtitle={subtitle(line)} checked={line.take.id === current} onclick={() => onpick(line.take.id)} />
			{/each}
		</Section>
	{/each}
</Sheet>
