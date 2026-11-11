// The take screen's data, for the prototype (#1). Units are metric and fixed: metres, millimetres,
// degrees. Display units may differ later; storage does not.

export type SetupId = 'A' | 'B' | 'C';
export const SETUP_IDS: readonly SetupId[] = ['A', 'B', 'C'];

export type Lens =
	| { name: string; kind: 'prime'; /** mm */ focalLength: number }
	| { name: string; kind: 'zoom'; /** mm */ min: number; /** mm */ max: number };

/** A camera setup: a letter, a body and a lens. */
export interface CameraSetup {
	id: SetupId;
	body: string;
	lens: Lens;
}

export type FieldKey = 'focalLength' | 'focusDistance' | 'tStop' | 'cameraHeight' | 'tilt';

/** One camera's numbers on one take. `focalLength` (mm) is only what was entered on a zoom. */
export type CameraValues = Record<FieldKey, number | null>;

export interface Still {
	id: string;
	/** An object URL, or a data URL in the mock. */
	url: string;
	name: string;
}

/** Start and end of a take, epoch ms. No start: not rolled. Start only: rolling. Both: filed. */
export interface Timing {
	start: number | null;
	end: number | null;
}

export interface Take extends Timing {
	id: string;
	scene: string;
	slate: string;
	take: string;
	cameras: Record<SetupId, CameraValues>;
	stills: Still[];
}
