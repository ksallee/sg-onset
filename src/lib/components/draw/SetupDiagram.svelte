<script lang="ts">
	// A slate's setup diagram (#87): a top-down sketch of where the cameras, the subject, the
	// lights and the markers stand, with lines, text and measurements. One per slate, kept on the
	// device (the `diagram` table). The slate's camera setups place themselves as cameras, each
	// with its lens and the wedge of what it sees; the person drags and turns them.
	import { Crosshair, Hand, Lightbulb, PenLine, Ruler, Type, User, Video } from '@lucide/svelte';
	import { useApp } from '$lib/app/app.svelte';
	import { useCurrent } from '$lib/app/current.svelte';
	import { liveList } from '$lib/app/live.svelte';
	import { settings } from '$lib/app/settings.svelte';
	import { cameraCaptions, cameraFov, DIAGRAM_REACH, DIAGRAM_SIZE, placeCameras, setupCameraIds, slateCameras } from '$lib/draw/diagram';
	import { styleFor, type Ink } from '$lib/draw/drawing';
	import type { Tool } from '$lib/draw/gesture';
	import { t } from '$lib/i18n/messages';
	import type { Slate } from '$lib/model/types';
	import DrawEditor from './DrawEditor.svelte';
	import { coverScreen } from './screen';
	import { DrawSession } from './session.svelte';

	let { slate, onclose }: { slate: Slate; onclose: () => void } = $props();

	coverScreen();
	const app = useApp();
	const current = useCurrent();
	const rows = liveList('diagram', () => slate.id);
	const takes = liveList('take', () => slate.id);
	const setups = liveList('cameraSetup', () => current.project?.id);
	const cameras = liveList('camera', () => current.project?.id);
	const lenses = liveList('lens', () => current.project?.id);
	const session = new DrawSession(
		app,
		'diagram',
		() => rows.value[0],
		(id, shapes) => ({ id, slateId: slate.id, ...DIAGRAM_SIZE, shapes })
	);

	const cams = $derived(slateCameras({ takes: takes.value, setups: setups.value, cameras: cameras.value, lenses: lenses.value }));
	const ready = $derived(rows.ready && takes.ready && setups.ready);
	const shapes = $derived(placeCameras(session.shapes, cams, DIAGRAM_SIZE, styleFor(DIAGRAM_SIZE).symbol));
	const fixed = $derived(setupCameraIds(shapes, cams));

	let tool = $state<Tool>('move');
	let ink = $state<Ink>('black');
	const name = $derived(slate.slateUID ?? '');

	const TOOLS = [
		{ id: 'move', label: t('draw.tool.move'), icon: Hand },
		{ id: 'draw', label: t('draw.tool.draw'), icon: PenLine },
		{ id: 'text', label: t('draw.tool.text'), icon: Type },
		{ id: 'measure', label: t('draw.tool.measure'), icon: Ruler },
		{ id: 'camera', label: t('draw.tool.camera'), icon: Video },
		{ id: 'subject', label: t('draw.tool.subject'), icon: User },
		{ id: 'light', label: t('draw.tool.light'), icon: Lightbulb },
		{ id: 'marker', label: t('draw.tool.marker'), icon: Crosshair }
	] satisfies { id: Tool; label: string; icon: unknown }[];
	const hint = $derived(tool === 'move' ? t('draw.hint.diagram.move') : t(`draw.hint.${tool}`));
</script>

<DrawEditor
	{session}
	title={t('draw.diagram.title', { slate: name })}
	label={t('draw.diagram.canvas', { slate: name })}
	hand={settings.value.hand}
	units={settings.value.units}
	size={ready ? DIAGRAM_SIZE : null}
	{shapes}
	toolset={TOOLS}
	bind:tool
	bind:ink
	{hint}
	changeLabel={() => ({ key: 'draw.diagram.edit', params: { slate: name } })}
	captions={cameraCaptions(cams)}
	fov={cameraFov(cams)}
	reach={DIAGRAM_REACH}
	keep={(id) => fixed.has(id)}
	newId={() => app.newId()}
	{onclose}
/>
