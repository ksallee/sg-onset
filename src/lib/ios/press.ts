// One physical press, one change: what a control on the action rail does with each pointer, click
// and key event. Pure: the times come in with the events, on the event clock (`event.timeStamp`,
// monotonic), never the wall clock.
//
// The start and end button (RecordButton) fires on the way down. A missed start is gone for good; a press too many is one Undo
// away and loses nothing. So no gesture may cost a press: sliding off or a touch cancel after
// the down changes nothing, and a held finger never blocks the next one. What prevents a start and
// an end in one go is time alone: the lockout.
//
// The other rail buttons fire on the release (the browser's click): sliding off is the way out,
// and the camera's file input needs a real click.

/** After the start and end button fires it takes no press for this long: longer than a bounce or a double tap,
    far shorter than any take or any gap between takes. */
export const RECORD_LOCKOUT_MS = 500;
/** The same for Photo, New take and Undo: a bounce is not two Undos, two deliberate taps are. */
export const BUTTON_LOCKOUT_MS = 300;
/** A click this soon after a pointer was on the control is that pointer's own click. */
export const CLICK_ECHO_MS = 700;

export interface PressState {
	/** The pointers on the control now: it shows pressed while there is one. */
	down: readonly number[];
	/** When it last fired. Null: not yet. */
	firedAt: number | null;
	/** When a pointer last went down or came up on it. Null: none has. */
	pointerAt: number | null;
}

export const idlePress: PressState = { down: [], firedAt: null, pointerAt: null };

export type PressEvent =
	/** `button`: the mouse button, 0 the main one. */
	| { type: 'down'; id: number; at: number; button?: number; pointerType?: string }
	| { type: 'up'; id: number; at: number }
	| { type: 'cancel'; id: number; at: number }
	/** The pointer slid off the control. */
	| { type: 'leave'; id: number }
	/** The browser's click: a release on the control, or an activation no pointer made. */
	| { type: 'click'; at: number }
	/** The shortcut key. */
	| { type: 'key'; at: number; repeat: boolean }
	/** The page went to the background or lost the focus: no up will come. */
	| { type: 'reset' };

export interface PressOptions {
	/** `down`: fires when the pointer lands. `release`: fires on the click. */
	on: 'down' | 'release';
	/** ms after a fire in which nothing fires. */
	lockout: number;
}

export interface PressResult {
	state: PressState;
	fire: boolean;
}

const stay = (state: PressState): PressResult => ({ state, fire: false });
const without = (down: readonly number[], id: number) => (down.includes(id) ? down.filter((d) => d !== id) : down);

/** Open unless it fired less than `lockout` ago. A clock that stepped back opens it. */
function open(state: PressState, at: number, lockout: number): boolean {
	if (state.firedAt === null) return true;
	const since = at - state.firedAt;
	return since < 0 || since >= lockout;
}

function fireAt(state: PressState, at: number, lockout: number): PressResult {
	return open(state, at, lockout) ? { state: { ...state, firedAt: at }, fire: true } : stay(state);
}

export function press(state: PressState, event: PressEvent, options: PressOptions): PressResult {
	switch (event.type) {
		case 'down': {
			if (event.pointerType === 'mouse' && (event.button ?? 0) !== 0) return stay(state);
			const next = { ...state, down: state.down.includes(event.id) ? state.down : [...state.down, event.id], pointerAt: event.at };
			return options.on === 'down' ? fireAt(next, event.at, options.lockout) : stay(next);
		}
		case 'up':
		case 'cancel': {
			if (!state.down.includes(event.id)) return stay(state);
			return stay({ ...state, down: without(state.down, event.id), pointerAt: event.at });
		}
		case 'leave':
			return stay(state.down.includes(event.id) ? { ...state, down: without(state.down, event.id) } : state);
		case 'click': {
			if (options.on === 'release') return fireAt(state, event.at, options.lockout);
			// Firing on the way down: the pointer's own click is an echo of a press already taken.
			const echo = state.down.length > 0 || (state.pointerAt !== null && Math.abs(event.at - state.pointerAt) < CLICK_ECHO_MS);
			return echo ? stay(state) : fireAt(state, event.at, options.lockout);
		}
		case 'key':
			return event.repeat ? stay(state) : fireAt(state, event.at, options.lockout);
		case 'reset':
			return stay(state.down.length ? { ...state, down: [] } : state);
	}
}

/**
 * The wall time (epoch ms) of a press: the event's own stamp, not the moment the handler ran.
 * `wallNow` and `perfNow` are `Date.now()` and `performance.now()` read together, `stamp` is
 * `event.timeStamp`. A stamp from the future or more than a second old is not trusted.
 */
export function pressInstant(wallNow: number, perfNow: number, stamp: number): number {
	const wait = perfNow - stamp;
	if (!(stamp > 0) || !(wait >= 0) || wait > 1000) return wallNow;
	return Math.round(wallNow - wait);
}

export interface KeyLike {
	key: string;
	repeat: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	/** The key went to a text field, a select, or something editable. */
	editable: boolean;
}

/** Whether a key event is the bare shortcut `key`, not typing and not a browser shortcut. */
export function isShortcut(event: KeyLike, key: string | null): boolean {
	if (!key || event.editable || event.ctrlKey || event.metaKey || event.altKey) return false;
	return event.key.toLowerCase() === key.toLowerCase();
}
