import { describe, expect, it } from 'vitest';
import type { Figure } from './drawing';
import { fieldOfView, fovWedge, squeezeOf } from './optics';

const camera = (over: Partial<Figure> = {}): Figure => ({ kind: 'symbol', id: 'c', symbol: 'camera', ink: 'black', at: { x: 500, y: 500 }, rotation: 0, size: 40, ...over });

describe('squeezeOf', () => {
	it('reads an anamorphic squeeze, and takes none as 1', () => {
		expect(squeezeOf({ num: 2, denom: 1 })).toBe(2);
		expect(squeezeOf({ num: 13, denom: 10 })).toBe(1.3);
		expect(squeezeOf(undefined)).toBe(1);
		expect(squeezeOf({ num: 0, denom: 1 })).toBe(1);
	});
});

describe('fieldOfView', () => {
	it('is the horizontal angle a lens sees across the sensor width', () => {
		// 2 atan(36 / (2 × 50)): a full-frame 50 mm sees 39.6°.
		expect(fieldOfView(50, 36)).toBeCloseTo(39.6, 1);
		expect(fieldOfView(18, 36)).toBeCloseTo(90, 0);
	});
	it('widens with the squeeze: a 2x anamorphic on a 28 mm wide sensor sees as 56 mm wide', () => {
		expect(fieldOfView(50, 28, 2)).toBeCloseTo(fieldOfView(50, 56)!, 6);
		expect(fieldOfView(50, 28, 2)).toBeCloseTo(58.5, 1);
	});
	it('says nothing without a focal length or a sensor width', () => {
		expect(fieldOfView(undefined, 36)).toBeUndefined();
		expect(fieldOfView(50, undefined)).toBeUndefined();
		expect(fieldOfView(0, 36)).toBeUndefined();
		expect(fieldOfView(50, -1)).toBeUndefined();
	});
});

describe('fovWedge', () => {
	it('opens from the front of the camera, the way it faces, as wide as the field of view', () => {
		const [apex, left, right] = fovWedge(camera(), 90, 300);
		expect(apex.x).toBeCloseTo(500);
		expect(apex.y).toBeLessThan(500);
		// Facing up, 90° wide: the far corners sit up and out at 45°.
		expect(left.x - apex.x).toBeCloseTo(-300 * Math.SQRT1_2);
		expect(right.x - apex.x).toBeCloseTo(300 * Math.SQRT1_2);
		expect(left.y).toBeCloseTo(right.y);
		expect(apex.y - left.y).toBeCloseTo(300 * Math.SQRT1_2);
	});
	it('turns with the camera', () => {
		const [apex, left, right] = fovWedge(camera({ rotation: 90 }), 40, 300);
		expect(apex.x).toBeGreaterThan(500);
		expect(left.x).toBeGreaterThan(apex.x);
		expect(left.y).toBeLessThan(right.y);
	});
});
