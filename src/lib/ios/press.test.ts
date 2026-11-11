import { describe, expect, it } from 'vitest';
import { BUTTON_LOCKOUT_MS, CLICK_ECHO_MS, RECORD_LOCKOUT_MS, idlePress, isShortcut, press, pressInstant, type PressEvent, type PressOptions, type PressState } from './press';

const RECORD: PressOptions = { on: 'down', lockout: RECORD_LOCKOUT_MS };
const BUTTON: PressOptions = { on: 'release', lockout: BUTTON_LOCKOUT_MS };

/** Runs events in order: the state after them and how many fired. */
function run(events: PressEvent[], options: PressOptions, from: PressState = idlePress) {
	let state = from;
	const fired: number[] = [];
	for (const event of events) {
		const result = press(state, event, options);
		state = result.state;
		if (result.fire) fired.push('at' in event ? event.at : -1);
	}
	return { state, fired };
}

const down = (at: number, id = 1, more: Partial<Extract<PressEvent, { type: 'down' }>> = {}): PressEvent => ({ type: 'down', id, at, ...more });
const up = (at: number, id = 1): PressEvent => ({ type: 'up', id, at });
const click = (at: number): PressEvent => ({ type: 'click', at });

describe('the windows', () => {
	it('are short next to any take, long next to a bounce', () => {
		expect(RECORD_LOCKOUT_MS).toBe(500);
		expect(BUTTON_LOCKOUT_MS).toBe(300);
		expect(CLICK_ECHO_MS).toBeGreaterThanOrEqual(RECORD_LOCKOUT_MS);
	});
});

describe('press, firing on the way down (Start and End)', () => {
	it('fires once on pointer down, not on the release nor on its click', () => {
		expect(run([down(1000), up(1120), click(1120)], RECORD).fired).toEqual([1000]);
	});
	it('does not fire again when a long hold ends past the lockout', () => {
		expect(run([down(1000), up(4000), click(4001)], RECORD).fired).toEqual([1000]);
	});
	it('shows pressed from the down to the up', () => {
		const held = run([down(1000)], RECORD).state;
		expect(held.down).toEqual([1]);
		expect(press(held, up(1100), RECORD).state.down).toEqual([]);
	});
	it('swallows a bounce and a double tap: no start and end in one go', () => {
		expect(run([down(1000), up(1040), click(1040), down(1090, 2), up(1130, 2), click(1130)], RECORD).fired).toEqual([1000]);
		expect(run([down(1000), up(1080), down(1000 + RECORD_LOCKOUT_MS - 1, 2)], RECORD).fired).toEqual([1000]);
	});
	it('takes the next press as soon as the lockout ends', () => {
		expect(run([down(1000), up(1080), down(1000 + RECORD_LOCKOUT_MS, 2)], RECORD).fired).toEqual([1000, 1500]);
	});
	it('has fired already when the finger slides off: the release changes nothing', () => {
		const { state, fired } = run([down(1000), { type: 'leave', id: 1 }, up(1300)], RECORD);
		expect(fired).toEqual([1000]);
		expect(state.down).toEqual([]);
	});
	it('keeps the press on a touch cancel, and is not left pressed', () => {
		const { state, fired } = run([down(1000), { type: 'cancel', id: 1, at: 1050 }], RECORD);
		expect(fired).toEqual([1000]);
		expect(state.down).toEqual([]);
	});
	it('takes a second finger inside the lockout as the same press', () => {
		const { state, fired } = run([down(1000, 1), down(1030, 2)], RECORD);
		expect(fired).toEqual([1000]);
		expect([...state.down].sort()).toEqual([1, 2]);
	});
	it('fires for a new finger past the lockout even while a palm still rests on it: never stuck', () => {
		expect(run([down(1000, 1), down(3000, 2)], RECORD).fired).toEqual([1000, 3000]);
	});
	it('fires for a pointer that is not the page’s primary one (the other hand is on the keypad)', () => {
		expect(run([down(1000, 7, { pointerType: 'touch' })], RECORD).fired).toEqual([1000]);
	});
	it('ignores every mouse button but the main one', () => {
		const { state, fired } = run([down(1000, 1, { pointerType: 'mouse', button: 2 })], RECORD);
		expect(fired).toEqual([]);
		expect(state.down).toEqual([]);
	});
	it('fires for a click that no pointer made (a screen reader, Enter on the button)', () => {
		expect(run([click(1000)], RECORD).fired).toEqual([1000]);
		expect(run([click(1000), click(1100)], RECORD).fired).toEqual([1000]);
	});
	it('does not take a pointer’s own late click for a new press, but takes one long after', () => {
		expect(run([down(1000), up(1100), click(1100 + CLICK_ECHO_MS - 1)], RECORD).fired).toEqual([1000]);
		expect(run([down(1000), up(1100), click(1100 + CLICK_ECHO_MS)], RECORD).fired).toEqual([1000, 1100 + CLICK_ECHO_MS]);
	});
	it('fires for the shortcut key once, never for its repeats', () => {
		const events: PressEvent[] = [
			{ type: 'key', at: 1000, repeat: false },
			{ type: 'key', at: 1600, repeat: true },
			{ type: 'key', at: 2200, repeat: true }
		];
		expect(run(events, RECORD).fired).toEqual([1000]);
	});
	it('holds the key to the same lockout as the finger', () => {
		expect(run([down(1000), { type: 'key', at: 1200, repeat: false }], RECORD).fired).toEqual([1000]);
	});
	it('drops what was held when the page goes away, and keeps the lockout', () => {
		const { state, fired } = run([down(1000), { type: 'reset' }, down(1100, 2)], RECORD);
		expect(fired).toEqual([1000]);
		expect(state.down).toEqual([2]);
	});
	it('fires after a reset once the lockout has passed', () => {
		expect(run([down(1000), { type: 'reset' }, down(9000, 2)], RECORD).fired).toEqual([1000, 9000]);
	});
	it('is not locked for ever when the clock steps back', () => {
		expect(run([down(5000), up(5050), down(100, 2)], RECORD).fired).toEqual([5000, 100]);
	});
	it('counts an up for a pointer it never saw as nothing', () => {
		const { state, fired } = run([up(1000, 9)], RECORD);
		expect(fired).toEqual([]);
		expect(state.down).toEqual([]);
	});
});

describe('press, firing on the release (Photo, New take, Undo)', () => {
	it('fires on the click, not on the way down', () => {
		expect(run([down(1000)], BUTTON).fired).toEqual([]);
		expect(run([down(1000), up(1100), click(1100)], BUTTON).fired).toEqual([1100]);
	});
	it('does nothing when the finger slides off: no click comes', () => {
		const { state, fired } = run([down(1000), { type: 'leave', id: 1 }, up(1300)], BUTTON);
		expect(fired).toEqual([]);
		expect(state.down).toEqual([]);
	});
	it('does nothing on a touch cancel', () => {
		expect(run([down(1000), { type: 'cancel', id: 1, at: 1100 }], BUTTON).fired).toEqual([]);
	});
	it('swallows a bounce: one Undo, not two', () => {
		expect(run([down(1000), up(1050), click(1050), down(1100), up(1150), click(1150)], BUTTON).fired).toEqual([1050]);
	});
	it('takes a second tap after the lockout', () => {
		expect(run([click(1000), click(1000 + BUTTON_LOCKOUT_MS)], BUTTON).fired).toEqual([1000, 1300]);
	});
	it('fires for a click no pointer made', () => {
		expect(run([click(1000)], BUTTON).fired).toEqual([1000]);
	});
	it('shows pressed only while the finger is on it', () => {
		const held = run([down(1000)], BUTTON).state;
		expect(held.down).toEqual([1]);
		expect(press(held, { type: 'leave', id: 1 }, BUTTON).state.down).toEqual([]);
		expect(press(held, { type: 'reset' }, BUTTON).state.down).toEqual([]);
	});
});

describe('pressInstant', () => {
	it('is the wall time less the wait since the event', () => {
		expect(pressInstant(1_700_000_000_000, 5000, 4988)).toBe(1_699_999_999_988);
	});
	it('rounds to a whole millisecond', () => {
		expect(pressInstant(1_700_000_000_000, 5000.4, 4990.8)).toBe(1_699_999_999_990);
	});
	it('is the wall time when the event has no usable stamp', () => {
		expect(pressInstant(1_700_000_000_000, 5000, 0)).toBe(1_700_000_000_000);
		expect(pressInstant(1_700_000_000_000, 5000, 5200)).toBe(1_700_000_000_000);
		expect(pressInstant(1_700_000_000_000, 5000, Number.NaN)).toBe(1_700_000_000_000);
	});
});

describe('isShortcut', () => {
	const key = (more: Partial<Parameters<typeof isShortcut>[0]> = {}) => ({ key: 'r', repeat: false, ctrlKey: false, metaKey: false, altKey: false, editable: false, ...more });
	it('is the bare key, either case', () => {
		expect(isShortcut(key(), 'r')).toBe(true);
		expect(isShortcut(key({ key: 'R' }), 'r')).toBe(true);
	});
	it('is not another key, least of all a keypad key', () => {
		for (const k of ['0', '5', '.', ',', '-', 'Backspace', 'Enter', ' ']) expect(isShortcut(key({ key: k }), 'r')).toBe(false);
	});
	it('is not a browser shortcut', () => {
		expect(isShortcut(key({ metaKey: true }), 'r')).toBe(false);
		expect(isShortcut(key({ ctrlKey: true }), 'r')).toBe(false);
		expect(isShortcut(key({ altKey: true }), 'r')).toBe(false);
	});
	it('is not typing in a field', () => {
		expect(isShortcut(key({ editable: true }), 'r')).toBe(false);
	});
	it('is off without a key', () => {
		expect(isShortcut(key(), null)).toBe(false);
		expect(isShortcut(key({ key: '' }), '')).toBe(false);
	});
});
