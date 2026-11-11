// Mock data for the take screen prototype (#1): three camera setups, two slates, a few takes.
// Nothing here is read from or written to anywhere.
import type { Session } from './session';
import type { CameraSetup, CameraValues, SetupId, Still, Take } from './types';

export const SETUPS: Record<SetupId, CameraSetup> = {
	A: { id: 'A', body: 'Alexa 35', lens: { name: '40 mm T1.8', kind: 'prime', focalLength: 40 } },
	B: { id: 'B', body: 'Alexa Mini LF', lens: { name: '24–290 mm T2.8', kind: 'zoom', min: 24, max: 290 } },
	C: { id: 'C', body: 'Komodo', lens: { name: '25 mm T2.1', kind: 'prime', focalLength: 25 } }
};

/** A flat picture standing in for a still: a data URL, so the mock needs no file. */
function mockStill(id: string, hue: number): Still {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 35% 62%)"/><stop offset="1" stop-color="hsl(${hue + 40} 40% 28%)"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><circle cx="118" cy="38" r="16" fill="hsl(${hue} 60% 85%)" opacity=".7"/><path d="M0 120 L48 62 L84 96 L112 74 L160 120Z" fill="hsl(${hue + 40} 30% 18%)" opacity=".8"/></svg>`;
	return { id, url: `data:image/svg+xml,${encodeURIComponent(svg)}`, name: `${id}.svg` };
}

const cam = (focusDistance: number, tStop: number, cameraHeight: number, tilt: number, focalLength: number | null = null): CameraValues => ({
	focalLength,
	focusDistance,
	tStop,
	cameraHeight,
	tilt
});

/** The session at `dayStart` (epoch ms, the first roll of the day). */
export function mockSession(dayStart: number): Session {
	const at = (min: number, sec = 0) => dayStart + (min * 60 + sec) * 1000;
	const take = (id: string, slate: string, n: string, start: number | null, end: number | null, cameras: Take['cameras'], stills: Still[] = []): Take => ({
		id,
		scene: '42',
		slate,
		take: n,
		cameras,
		start,
		end,
		stills
	});
	const wide = { A: cam(4.2, 2.8, 1.45, -3), B: cam(12, 4, 2.1, -8, 135), C: cam(2.4, 2.8, 0.6, 12) };
	const close = { A: cam(1.8, 2, 1.52, 0), B: cam(6.5, 4, 1.6, -2, 85), C: cam(2.4, 2.8, 0.6, 12) };
	return {
		takes: [
			take('m-42a-1', '42A', '1', at(0), at(1, 12), wide, [mockStill('m-s1', 28), mockStill('m-s2', 200)]),
			take('m-42a-2', '42A', '2', at(6), at(7, 3), wide),
			take('m-42a-3', '42A', '3', at(11), at(12, 20), { ...wide, B: cam(12, 4, 2.1, -8, 150) }, [mockStill('m-s3', 320)]),
			take('m-42b-1', '42B', '1', at(31), at(31, 48), close, [mockStill('m-s4', 150)]),
			take('m-42b-2', '42B', '2', at(36), at(36, 41), { ...close, A: cam(1.6, 2, 1.52, 0) }, [mockStill('m-s5', 95), mockStill('m-s6', 260)]),
			take('m-42b-3', '42B', '3', null, null, { ...close, A: cam(1.6, 2, 1.52, 0) })
		],
		currentId: 'm-42b-3',
		recents: {
			focalLength: [85, 135, 150, 50, 24],
			focusDistance: [1.6, 1.8, 4.2, 6.5, 12],
			tStop: [2, 2.8, 4, 5.6, 1.8],
			cameraHeight: [1.52, 1.45, 0.6, 2.1, 1.2],
			tilt: [0, -3, -8, 12, 5]
		}
	};
}
