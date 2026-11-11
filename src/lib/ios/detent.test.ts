import { describe, expect, it } from 'vitest';
import { detentOffset, snapDetent } from './detent';

const H = 800;

describe('detentOffset', () => {
	it('large sits at 0, medium halfway, a fraction leaves that share visible', () => {
		expect(detentOffset('large', H)).toBe(0);
		expect(detentOffset('medium', H)).toBe(400);
		expect(detentOffset(0.25, H)).toBe(600);
	});
});

describe('snapDetent', () => {
	it('snaps to the nearest detent when released slowly', () => {
		expect(snapDetent(100, 0, ['medium', 'large'], H)).toBe('large');
		expect(snapDetent(300, 0, ['medium', 'large'], H)).toBe('medium');
		expect(snapDetent(450, 0, ['medium', 'large'], H)).toBe('medium');
	});

	it('dismisses past a third of the smallest detent', () => {
		// Medium shows 400 px; a third of that past it is 533.
		expect(snapDetent(520, 0, ['medium', 'large'], H)).toBe('medium');
		expect(snapDetent(540, 0, ['medium', 'large'], H)).toBeNull();
		expect(snapDetent(270, 0, ['large'], H)).toBeNull();
		expect(snapDetent(260, 0, ['large'], H)).toBe('large');
	});

	it('follows a flick to the next detent in its direction', () => {
		expect(snapDetent(40, 1.2, ['medium', 'large'], H)).toBe('medium');
		expect(snapDetent(380, -1.2, ['medium', 'large'], H)).toBe('large');
	});

	it('a fast flick down from the smallest detent dismisses', () => {
		expect(snapDetent(420, 1.2, ['medium', 'large'], H)).toBeNull();
		expect(snapDetent(20, 1.2, ['large'], H)).toBeNull();
	});

	it('a flick up from the largest stays there', () => {
		expect(snapDetent(10, -2, ['medium', 'large'], H)).toBe('large');
	});

	it('takes detents in any order', () => {
		expect(snapDetent(300, 0, ['large', 'medium'], H)).toBe('medium');
	});

	it('cannot be dismissed when told so', () => {
		expect(snapDetent(700, 3, ['medium', 'large'], H, false)).toBe('medium');
	});
});
