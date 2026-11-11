// What the slates and templates pages read about the project besides slates and takes: its gear
// and lighting setups (to name a linked entry and to pick one), and its templates. Live. Provided
// once by a page, read by its parts.
import { getContext, setContext } from 'svelte';
import { liveList } from '$lib/app/live.svelte';
import { useCurrent } from '$lib/app/current.svelte';
import type { TemplateRecord } from '$lib/model/template';
import type { CameraSetup, Lens } from '$lib/model/types';
import { sortTemplates } from '$lib/templates/list';

export type Option = { value: string; label: string };

export interface Refs {
	readonly setups: CameraSetup[];
	readonly lenses: Lens[];
	readonly templates: TemplateRecord[];
	/** The name of any linked entry, by id. */
	readonly names: ReadonlyMap<string, string>;
	/** What a ref field can point at, by field key. */
	options(key: string): Option[];
	template(id: string | undefined): TemplateRecord | undefined;
}

const KEY = Symbol('sg-onset-slates-refs');
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const sorted = (options: Option[]) => options.sort((a, b) => collator.compare(a.label, b.label));

export function provideRefs(): Refs {
	const current = useCurrent();
	const project = () => current.project?.id;
	const setupRows = liveList('cameraSetup', project);
	const cameraRows = liveList('camera', project);
	const lensRows = liveList('lens', project);
	const lightRows = liveList('lightingSetup', project);
	const templateRows = liveList('template', project);

	const options = $derived<Record<string, Option[]>>({
		cameraSetupId: sorted(setupRows.value.map((s) => ({ value: s.id, label: s.cameraLabel ?? '' }))),
		cameraId: sorted(cameraRows.value.map((c) => ({ value: c.id, label: [c.cameraMake, c.cameraModel].filter(Boolean).join(' ') }))),
		lensId: sorted(lensRows.value.map((l) => ({ value: l.id, label: l.lensModel ?? '' }))),
		lightingSetupId: sorted(lightRows.value.map((l) => ({ value: l.id, label: l.label ?? '' })))
	});
	const names = $derived(new Map(Object.values(options).flatMap((list) => list.map((o) => [o.value, o.label] as const))));
	const setups = $derived(setupRows.value);
	const templates = $derived(sortTemplates(templateRows.value));

	const refs: Refs = {
		get setups() {
			return setups;
		},
		get lenses() {
			return lensRows.value;
		},
		get templates() {
			return templates;
		},
		get names() {
			return names;
		},
		options: (key) => options[key] ?? [],
		template: (id) => (id === undefined ? undefined : templates.find((t) => t.id === id))
	};
	setContext(KEY, refs);
	return refs;
}

export function useRefs(): Refs {
	const refs = getContext<Refs | undefined>(KEY);
	if (!refs) throw new Error('useRefs: provideRefs() first, in the page.');
	return refs;
}
