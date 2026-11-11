// The take screen's state in the browser: the pure session (session.ts) and its undo history,
// plus what only the browser has: the clock, new ids, object URLs for stills, the timer that
// clears the undo line. In memory only (#1).
import { t, type MessageKey, type Params } from '$lib/i18n/messages';
import { entryValue, keypadPress, startEntry, stepValue, type Entry, type Key } from '$lib/ios/keypad';
import { fieldValue, formatField, nextField, specFor, type FieldSpec } from './fields';
import { commit, emptyHistory, undo, type History } from './history';
import { mockSession, SETUPS } from './mock';
import { elapsedMs, phaseOf } from './record';
import { addStill, currentTake, newTake, previousTake, record, recordTarget, rollingTake, select, setValue, type Session } from './session';
import type { FieldKey, SetupId } from './types';

const NOTICE_MS = 6000;

export class TakeScreen {
	session = $state.raw<Session>(mockSession(new Date().setHours(9, 41, 0, 0)));
	history = $state.raw<History<Session>>(emptyHistory());
	/** The clock, moved by `tick` while a take rolls. */
	now = $state(Date.now());
	/** The camera whose numbers show. */
	setup = $state<SetupId>('A');
	/** The field in the keypad, or null when it is closed. */
	field = $state<FieldKey | null>(null);
	entry = $state.raw<Entry>(startEntry(null));
	/** The undo line: what was just done. */
	notice = $state<{ text: string; undoable: boolean } | null>(null);

	#noticeTimer: ReturnType<typeof setTimeout> | undefined;
	#urls: string[] = [];

	readonly setups = SETUPS;
	take = $derived(currentTake(this.session));
	rolling = $derived(rollingTake(this.session));
	phase = $derived(phaseOf(this.take));
	elapsed = $derived(elapsedMs(this.take, this.now));
	rollingElapsed = $derived(this.rolling ? elapsedMs(this.rolling, this.now) : 0);
	target = $derived(recordTarget(this.session));
	lens = $derived(SETUPS[this.setup].lens);
	spec = $derived<FieldSpec | null>(this.field ? specFor(this.field, this.lens) : null);
	before = $derived(previousTake(this.session, this.take));
	canUndo = $derived(this.history.past.length > 0);

	/** A change: the state before it is kept for Undo, and the undo line says what was done. */
	#apply(next: Session, key: MessageKey, params: Params) {
		if (next === this.session) return;
		const label = t(key, params);
		this.history = commit(this.history, this.session, label);
		this.session = next;
		this.#say(label, true);
	}

	#say(text: string, undoable: boolean) {
		clearTimeout(this.#noticeTimer);
		this.notice = { text, undoable };
		this.#noticeTimer = setTimeout(() => (this.notice = null), NOTICE_MS);
	}

	tick() {
		this.now = Date.now();
	}

	// ------------------------------------------------------------ capture

	record() {
		this.closeField();
		this.tick();
		const { action } = this.target;
		const next = record(this.session, this.now, crypto.randomUUID());
		const take = currentTake(next).take;
		this.#apply(next, action === 'cut' ? 'undo.filed' : 'undo.rolled', { take });
	}

	newTake() {
		this.closeField();
		const next = newTake(this.session, crypto.randomUUID());
		this.#apply(next, 'undo.newTake', { take: currentTake(next).take });
	}

	addPhoto(file: File) {
		const url = URL.createObjectURL(file);
		this.#urls.push(url);
		this.#apply(addStill(this.session, { id: crypto.randomUUID(), url, name: file.name }), 'undo.photo', { take: this.take.take });
	}

	undo() {
		this.field = null;
		const back = undo(this.history);
		if (!back) return;
		this.history = back.history;
		this.session = back.state;
		this.tick();
		this.#say(t('undo.undone', { what: back.label }), false);
	}

	// ------------------------------------------------------------ browse

	select(id: string) {
		this.closeField();
		this.session = select(this.session, id);
	}

	pickSetup(id: SetupId) {
		this.closeField();
		this.setup = id;
	}

	// ------------------------------------------------------------ numbers

	/** The value a field of a camera shows: the text being typed while it is in the keypad. */
	shownFor(setup: SetupId, key: FieldKey): string {
		if (setup === this.setup && key === this.field && !this.entry.fresh) return this.entry.text;
		const lens = SETUPS[setup].lens;
		return formatField(fieldValue(this.take.cameras[setup], key, lens), specFor(key, lens));
	}

	shown(key: FieldKey): string {
		return this.shownFor(this.setup, key);
	}

	/** A number of a camera, into the keypad. */
	openCell(setup: SetupId, key: FieldKey) {
		if (setup !== this.setup) this.pickSetup(setup);
		this.openField(key);
	}

	openField(key: FieldKey) {
		if (key === this.field) return;
		this.commitField();
		this.field = key;
		this.entry = startEntry(fieldValue(this.take.cameras[this.setup], key, this.lens), specFor(key, this.lens).decimals);
	}

	press(key: Key) {
		if (this.spec) this.entry = keypadPress(this.entry, key, this.spec);
	}

	step(dir: 1 | -1) {
		if (!this.spec) return;
		const value = stepValue(entryValue(this.entry, this.spec), dir, this.spec);
		this.entry = { text: formatField(value, this.spec), fresh: false };
	}

	/** A recent value: set at once, the keypad stays on the field. */
	pickRecent(value: number) {
		if (!this.spec) return;
		this.entry = { text: formatField(value, this.spec), fresh: false };
		this.commitField();
		this.entry = { ...this.entry, fresh: true };
	}

	/** Writes what was typed to the take. Nothing typed, or no change: nothing written. */
	commitField() {
		const { field, spec } = this;
		if (!field || !spec || this.entry.fresh) return;
		const value = entryValue(this.entry, spec);
		if (value === this.take.cameras[this.setup][field]) return;
		this.#apply(setValue(this.session, this.setup, field, value), 'undo.value', {
			field: t(spec.label),
			value: value === null ? t('take.empty') : formatField(value, spec)
		});
	}

	nextField() {
		if (!this.field) return;
		const next = nextField(this.field, this.lens);
		if (next) this.openField(next);
		else this.closeField();
	}

	closeField() {
		this.commitField();
		this.field = null;
	}

	destroy() {
		clearTimeout(this.#noticeTimer);
		this.#urls.forEach((u) => URL.revokeObjectURL(u));
	}
}
