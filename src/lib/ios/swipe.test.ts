import { describe, expect, it } from 'vitest';
import { ACTION_W, swipeState } from './swipe';

const one = [{ label: 'Delete' }];
const two = [{ label: 'Delete' }, { label: 'Flag' }];

describe('swipeState', () => {
	it('no actions: the row does not move', () => {
		expect(swipeState(-120, 390, [])).toEqual({ offset: 0, settle: 'closed', full: false });
	});

	it('only leftwards: a swipe right stays closed', () => {
		expect(swipeState(60, 390, one)).toEqual({ offset: 0, settle: 'closed', full: false });
	});

	it('follows the finger, opens past half the actions width', () => {
		expect(swipeState(-30, 390, one).offset).toBe(-30);
		expect(swipeState(-30, 390, one).settle).toBe('closed');
		expect(swipeState(-50, 390, one).settle).toBe('open');
		expect(swipeState(-2 * ACTION_W, 390, two).offset).toBe(-2 * ACTION_W);
	});

	it('past the actions it still follows; past 60 % of the row it is a full swipe', () => {
		const s = swipeState(-200, 390, one);
		expect(s.offset).toBe(-200);
		expect(s.settle).toBe('open');
		expect(s.full).toBe(false);
		const f = swipeState(-240, 390, one);
		expect(f.full).toBe(true);
		expect(f.settle).toBe('full');
	});

	it('a flick opens or closes against the distance', () => {
		expect(swipeState(-20, 390, one, -0.8).settle).toBe('open');
		expect(swipeState(-60, 390, one, 0.8).settle).toBe('closed');
	});

	it('never moves past the row', () => {
		expect(swipeState(-900, 390, one).offset).toBe(-390);
	});
});
