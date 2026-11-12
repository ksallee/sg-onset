// The take screen in the browser: the slate's takes, setups and gear read live from the store,
// what is on screen (the take number, the camera, the field in the keypad), and every action as
// an edit. The rules are pure, in this folder; this runs them on the store through `app.edit`, so
// each press is saved, queued for sync and one Undo. Nothing here is the truth: a reload reads it
// all back, the running take included. Make it while the page initialises.

import type { App } from '$lib/app/app.svelte';
import type { Current } from '$lib/app/current.svelte';
import { live, liveList } from '$lib/app/live.svelte';
import { settings } from '$lib/app/settings.svelte';
import type { Label } from '$lib/app/undo';
import { fieldLabel, issueText } from '$lib/i18n/modelText';
import { t } from '$lib/i18n/messages';
import type { FieldDef } from '$lib/model/catalogue';
import type { FieldValue, Lens, Still, Take } from '$lib/model/types';
import { sameValue } from '$lib/model/value';
import { sortTemplates } from '$lib/templates/list';
import { canStepEntry, commitEntry, pressEntry, startEntry, stepEntry, type EntryKey, type FieldEntry } from './entry';
import { entrySpec, isLocked, numberFields, shownValue, slotKey, visibleFields, type EntrySpec } from './fields';
import { activeSetupIds, cameraColumns, groupTakes, NO_SETUP, type TakeGroup } from './groups';
import { groupMark, groupNote, markPatch, newStill, notePatch, photoTake, type Mark } from './marks';
import { groupPhase, groupTimes, runningGroup } from './phase';
import { nextSecondIn } from './record';
import { recentValues } from './recent';
import { addCameraTake, nextTakes, pressTarget, shownGroup, startEndPlan } from './startEnd';
import { groupChanged, groupLink, groupLinkPatch, groupResetPatch, groupUnlinkPatch, type GroupLink } from './template';

/** The field in the keypad: whose, which, start or end value. */
export interface OpenField {
	setupId: string;
	def: FieldDef;
	end: boolean;
}

export class Shoot {
	readonly #app: App;
	readonly #current: Current;

	readonly takes;
	readonly setups;
	readonly cameras;
	readonly lenses;
	/** The stills of every take of the slate. */
	readonly stills;
	/** The project's templates. */
	readonly templates;

	/** The take number picked. None: the running one, else the last. */
	selected = $state<string | undefined>(undefined);
	/** The camera picked: whose numbers the dock types, whose take a photo goes on. */
	picked = $state<string | undefined>(undefined);
	/** Every number of the catalogue, not the default five. */
	showAll = $state(false);
	field = $state.raw<OpenField | null>(null);
	entry = $state.raw<FieldEntry>(startEntry(''));
	/** What is wrong with what was typed. */
	issue = $state<string | null>(null);
	/** A photo that did not save. */
	photoIssue = $state<string | null>(null);
	/** The clock, moved each whole second of the running take. */
	now = $state(Date.now());
	/** Photos taken this visit, shown from the file while the store writes it. */
	pending = $state.raw<Record<string, string>>({});
	/** When the page opened: its notice says only what was done since. */
	readonly openedAt = Date.now();
	/** Photos the store is still writing. */
	unsaved = $state.raw<Still[]>([]);

	readonly groups = $derived.by(() => groupTakes(this.takes.value));
	readonly columns = $derived.by(() => cameraColumns(this.setups.value, this.groups));
	readonly group = $derived.by(() => shownGroup(this.groups, this.selected));
	readonly previous = $derived.by(() => (this.group ? this.groups[this.groups.indexOf(this.group) - 1] : undefined));
	readonly phase = $derived(this.group ? groupPhase(this.group) : 'idle');
	readonly times = $derived.by(() => (this.group ? groupTimes(this.group) : { start: null, end: null }));
	readonly running = $derived.by(() => runningGroup(this.groups));
	readonly runningStart = $derived.by(() => (this.running ? groupTimes(this.running).start : null));
	readonly target = $derived.by(() => pressTarget(this.groups, this.selected));
	readonly active = $derived.by(() => activeSetupIds(this.groups, this.setups.value));
	readonly setupId = $derived.by(() => {
		const ids = this.columns.map((c) => c.id);
		if (this.picked !== undefined && ids.includes(this.picked)) return this.picked;
		const onTake = this.group ? ids.find((id) => id in this.group!.bySetup) : undefined;
		return onTake ?? ids[0] ?? NO_SETUP;
	});
	readonly fields = $derived(visibleFields(this.showAll));
	readonly groupStills = $derived.by(() => {
		const ids = new Set(this.group?.takes.map((t) => t.id) ?? []);
		const stored = this.stills.value;
		const writing = this.unsaved.filter((u) => !stored.some((s) => s.id === u.id));
		return [...stored, ...writing].filter((s) => ids.has(s.takeId)).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
	});
	readonly circled = $derived(this.group ? groupMark(this.group, 'circleTake') : false);
	readonly noGood = $derived(this.group ? groupMark(this.group, 'noGood') : false);
	readonly note = $derived(this.group ? groupNote(this.group) : '');
	/** The take templates to pick from, by name. */
	readonly takeTemplates = $derived.by(() => sortTemplates(this.templates.value.filter((tp) => tp.scope === 'take')));
	/** The template the take on screen follows. */
	readonly link = $derived.by<GroupLink>(() => (this.group ? groupLink(this.group) : { kind: 'none' }));
	/** That template; undefined when there is none, or it was deleted. */
	readonly template = $derived.by(() => {
		const link = this.link;
		return link.kind === 'one' ? this.templates.value.find((tp) => tp.id === link.id) : undefined;
	});
	/** The template fields changed on this take since. */
	readonly templateChanged = $derived.by(() => (this.group && this.template ? groupChanged(this.group, this.template) : []));
	readonly spec = $derived.by<EntrySpec | null>(() => (this.field ? entrySpec(this.field.def, settings.value.units, this.lensOf(this.takeOf(this.field.setupId))) : null));
	readonly recents = $derived.by(() => (this.field ? recentValues(this.takes.value, this.field.def, slotKey(this.field.def.key, this.field.end), settings.value.units) : []));

	constructor(app: App, current: Current) {
		this.#app = app;
		this.#current = current;
		this.takes = liveList('take', () => current.slate?.id);
		this.setups = liveList('cameraSetup', () => current.project?.id);
		this.cameras = liveList('camera', () => current.project?.id);
		this.lenses = liveList('lens', () => current.project?.id);
		this.templates = liveList('template', () => current.project?.id);
		this.stills = live<Still[]>(
			['still', 'take'],
			async (store) => {
				const ids = this.takes.value.map((t) => t.id);
				return (await Promise.all(ids.map((id) => store.list('still', id)))).flat();
			},
			[]
		);

		// The clock runs while a take does, on its whole seconds.
		$effect(() => {
			const start = this.runningStart;
			if (start === null) return;
			let timer: ReturnType<typeof setTimeout>;
			const look = () => {
				this.now = Date.now();
				timer = setTimeout(look, nextSecondIn(start, this.now) + 4);
			};
			look();
			return () => clearTimeout(timer);
		});
		// Another slate: nothing picked carries over.
		$effect(() => {
			void current.slate?.id;
			this.selected = undefined;
			this.field = null;
		});
		$effect(() => () => Object.values(this.pending).forEach((url) => URL.revokeObjectURL(url)));
	}

	get slate() {
		return this.#current.slate;
	}

	takeOf(setupId: string): Take | undefined {
		return this.group?.bySetup[setupId];
	}

	lensOf(take: Take | undefined, setupId?: string): Lens | undefined {
		const id = take?.lensId ?? this.setups.value.find((s) => s.id === setupId)?.lensId;
		return id ? this.lenses.value.find((l) => l.id === id) : undefined;
	}

	cameraName(take: Take | undefined, setupId: string): string {
		const id = take?.cameraId ?? this.setups.value.find((s) => s.id === setupId)?.cameraId;
		return this.cameras.value.find((c) => c.id === id)?.cameraModel ?? '';
	}

	/** A value as shown, the text being typed while it is in the keypad. */
	shown(setupId: string, def: FieldDef, end = false): string {
		const f = this.field;
		if (f && f.setupId === setupId && f.def.key === def.key && f.end === end && !this.entry.fresh) return this.entry.text === 'inf' ? '∞' : this.entry.text;
		const take = this.takeOf(setupId);
		return take ? shownValue(def, take, this.lensOf(take), settings.value.units, end) : '';
	}

	/** The value differs from the same camera's take before. */
	changed(setupId: string, def: FieldDef): boolean {
		const take = this.takeOf(setupId);
		const before = this.previous?.bySetup[setupId];
		if (!take || !before || isLocked(def, this.lensOf(take))) return false;
		const rec = (r: Take, key: string) => (r as Record<string, unknown>)[key];
		return !sameValue(rec(take, def.key), rec(before, def.key)) || !sameValue(rec(take, slotKey(def.key, true)), rec(before, slotKey(def.key, true)));
	}

	locked(setupId: string, def: FieldDef): boolean {
		const take = this.takeOf(setupId);
		return isLocked(def, this.lensOf(take, setupId));
	}

	// ------------------------------------------------------------ capture

	#label(key: Parameters<typeof t>[0], params: Record<string, string | number>): Label {
		return { key, params };
	}

	/** Start or End, pressed at `at` (epoch ms, when the finger landed). */
	async press(at: number) {
		this.close();
		const slate = this.slate;
		if (!slate) return;
		const plan = startEndPlan({ groups: this.groups, selected: this.selected, active: this.active, setups: this.setups.value, slateId: slate.id, at, newId: () => this.#app.newId() });
		const take = plan.number;
		if (plan.kind === 'end') {
			await this.#app.edit.apply('take', plan.patch, this.#label('undo.filed', { take }));
		} else if (plan.kind === 'start') {
			this.selected = take;
			await this.#app.edit.apply('take', plan.patch, this.#label('take.edit.start', { take }));
		} else {
			this.selected = take;
			const rows = plan.creates;
			await this.#app.edit.group(this.#label('take.edit.start', { take }), async () => {
				for (const row of rows) await this.#app.edit.create('take', row);
			});
		}
	}

	/** The next take number on every active camera, not started. Not while a take runs. */
	async newTake() {
		const slate = this.slate;
		if (!slate || this.running) return;
		this.close();
		const rows = nextTakes({ groups: this.groups, active: this.active, setups: this.setups.value, slateId: slate.id, newId: () => this.#app.newId() });
		const take = rows[0]?.take ?? '1';
		this.selected = take;
		await this.#app.edit.group(this.#label('take.edit.new', { take }), async () => {
			for (const row of rows) await this.#app.edit.create('take', row);
		});
	}

	/**
	 * A photo from the camera: on the picked camera's take. It shows at once, from the file; the
	 * store writes it behind and nothing waits for that. If the write fails, the photo goes and
	 * the notice says so.
	 */
	addPhoto(file: File) {
		const slate = this.slate;
		if (!slate) return;
		const at = this.#app.now();
		const id = this.#app.newId();
		const existing = photoTake(this.group, this.setupId);
		// No take yet on this slate: the photo makes the next one, not started.
		const [made] = existing ? [] : nextTakes({ groups: this.groups, active: [this.setupId], setups: this.setups.value, slateId: slate.id, newId: () => this.#app.newId() });
		const take = existing ?? made;
		const still = newStill(take.id, id, at);
		const url = URL.createObjectURL(file);
		this.pending = { ...this.pending, [id]: url };
		this.unsaved = [...this.unsaved, still];
		if (made) this.selected = made.take;
		const label = this.#label('take.edit.photo', { take: take.take ?? '' });
		const run = async () => {
			if (made) await this.#app.edit.create('take', made);
			await this.#app.edit.create('still', still, { attach: { blob: file, name: file.name }, label });
		};
		void (made ? this.#app.edit.group(label, run) : run())
			.catch(() => {
				this.photoIssue = t('take.photo.failed');
				setTimeout(() => (this.photoIssue = null), 6000);
				const { [id]: gone, ...rest } = this.pending;
				URL.revokeObjectURL(gone);
				this.pending = rest;
			})
			.finally(() => (this.unsaved = this.unsaved.filter((s) => s.id !== id)));
	}

	removeStill(still: Still) {
		const take = this.takes.value.find((t) => t.id === still.takeId);
		void this.#app.edit.remove('still', still.id, this.#label('take.edit.photoRemoved', { take: take?.take ?? '' }));
	}

	toggleMark(mark: Mark) {
		const group = this.group;
		if (!group) return;
		const on = !groupMark(group, mark);
		const key = mark === 'circleTake' ? (on ? 'take.edit.circled' : 'take.edit.uncircled') : on ? 'take.edit.noGood' : 'take.edit.good';
		void this.#app.edit.apply('take', markPatch(group, mark, on), this.#label(key, { take: group.number }));
	}

	setNote(text: string) {
		const group = this.group;
		if (!group) return;
		void this.#app.edit.apply('take', notePatch(group, text), this.#label('take.edit.note', { take: group.number }));
	}

	/** Links every camera of the take on screen to a take template and fills its values. */
	linkTemplate(id: string) {
		const group = this.group;
		const tp = this.takeTemplates.find((x) => x.id === id);
		if (!group || !tp) return;
		this.close();
		void this.#app.edit.apply('take', groupLinkPatch(group, tp), this.#label('slates.link.linked', { what: t('take.row', { take: group.number }), template: tp.name }));
	}

	resetTemplate() {
		const group = this.group;
		const tp = this.template;
		if (!group || !tp) return;
		this.close();
		void this.#app.edit.apply('take', groupResetPatch(group, tp), this.#label('slates.link.reset.done', { what: t('take.row', { take: group.number }), template: tp.name }));
	}

	unlinkTemplate() {
		const group = this.group;
		if (!group) return;
		void this.#app.edit.apply('take', groupUnlinkPatch(group), this.#label('slates.link.unlinked', { what: t('take.row', { take: group.number }) }));
	}

	addCamera(setupId: string) {
		const slate = this.slate;
		const group = this.group;
		if (!slate || !group) return;
		const row = addCameraTake({ groups: this.groups, number: group.number, setupId, setups: this.setups.value, slateId: slate.id, id: this.#app.newId() });
		const label = this.columns.find((c) => c.id === setupId)?.label ?? '';
		this.picked = setupId;
		void this.#app.edit.create('take', row, { label: this.#label('take.edit.cameraAdded', { camera: label, take: group.number }) });
	}

	removeCamera(setupId: string) {
		const take = this.takeOf(setupId);
		if (!take) return;
		if (this.field?.setupId === setupId) this.field = null;
		const label = this.columns.find((c) => c.id === setupId)?.label ?? '';
		void this.#app.edit.removeTree('take', take.id, this.#label('take.edit.cameraRemoved', { camera: label, take: take.take ?? '' }));
	}

	select(number: string) {
		this.close();
		this.selected = number;
	}

	pick(setupId: string) {
		if (this.field && this.field.setupId !== setupId) this.close();
		this.picked = setupId;
	}

	// ------------------------------------------------------------ numbers

	open(setupId: string, def: FieldDef, end = false) {
		if (this.field && this.field.setupId === setupId && this.field.def.key === def.key && this.field.end === end) return;
		if (!this.commit()) return;
		if (!this.takeOf(setupId) || this.locked(setupId, def)) return;
		this.picked = setupId;
		this.field = { setupId, def, end };
		const text = this.shown(setupId, def, end);
		this.entry = startEntry(text === '∞' ? 'inf' : text);
		this.issue = null;
	}

	key(key: EntryKey) {
		if (!this.spec) return;
		this.entry = pressEntry(this.entry, key, this.spec);
		this.issue = null;
	}

	step(dir: 1 | -1) {
		if (!this.spec || !this.field) return;
		this.entry = stepEntry(this.entry, dir, this.spec, settings.value.units, this.field.def);
		this.issue = null;
	}

	canStep(dir: 1 | -1): boolean {
		return !!this.spec && canStepEntry(this.entry, dir, this.spec);
	}

	/** A recent value: stored at once, as it was stored before. The keypad stays on the field. */
	pickRecent(value: FieldValue, text: string) {
		const f = this.field;
		const take = f && this.takeOf(f.setupId);
		if (!f || !take) return;
		this.#save(take, f, value, text);
		this.entry = startEntry(text);
		this.issue = null;
	}

	#save(take: Take, f: OpenField, value: FieldValue | undefined, text: string) {
		const key = slotKey(f.def.key, f.end);
		if (sameValue((take as Record<string, unknown>)[key], value)) return;
		const field = fieldLabel(f.def, f.end);
		const label = value === undefined ? this.#label('take.edit.cleared', { field }) : this.#label('take.edit.value', { field, value: text });
		void this.#app.edit.set('take', take, key, value, label);
	}

	/** Saves what was typed. False when it does not read: the issue shows, the keypad stays. */
	commit(): boolean {
		const f = this.field;
		const spec = this.spec;
		const take = f && this.takeOf(f.setupId);
		if (!f || !spec || !take) return true;
		const result = commitEntry(f.def, f.end, this.entry, spec, settings.value.units);
		if (!result.ok) {
			this.issue = issueText(result.issue);
			return false;
		}
		if ('unchanged' in result) return true;
		this.#save(take, f, result.value, this.entry.text);
		this.entry = { ...this.entry, fresh: true };
		return true;
	}

	/** The next number of the same camera that is typed, start values only; none: the keypad closes. */
	next() {
		const f = this.field;
		if (!f || !this.commit()) return;
		const list = this.fields;
		const after = list.slice(list.findIndex((d) => d.key === f.def.key) + 1).find((d) => !this.locked(f.setupId, d));
		if (after) this.open(f.setupId, after);
		else this.field = null;
	}

	hasNext(): boolean {
		const f = this.field;
		if (!f) return false;
		const list = this.fields;
		return list.slice(list.findIndex((d) => d.key === f.def.key) + 1).some((d) => !this.locked(f.setupId, d));
	}

	/** Start value or end value of the field in the keypad. */
	setEnd(end: boolean) {
		const f = this.field;
		if (!f || f.end === end || !this.commit()) return;
		this.field = { ...f, end };
		const text = this.shown(f.setupId, f.def, end);
		this.entry = startEntry(text === '∞' ? 'inf' : text);
	}

	close() {
		if (this.commit()) this.field = null;
	}

	/** Every number of the catalogue: for the "all fields" switch. */
	readonly allCount = numberFields().length;
}

export type { TakeGroup };
