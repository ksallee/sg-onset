// The field catalogue: every field the app captures, as data. Forms, validation, bulk edit,
// templates and export all read it; the record types in types.ts are derived from it.
//
// Keys follow MovieLabs OMC and OpenTrackIO. Units and types follow OpenTrackIO. Where neither
// names a field, the CRIF name in camelCase. `names` holds what each standard calls the field, for
// export. Sources: OMC v2.8, OpenTrackIO 1.0.1, VES CRIF v1.1, ALE files from ARRI, Avid and
// Silverstack, USD UsdGeomCamera, VES on-set guide v1.1.0 section numbers.

export const SCOPES = ['project', 'shootDay', 'lightingSetup', 'cameraSetup', 'slate', 'take', 'camera', 'lens'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * How a value is stored.
 * - string, date (YYYY-MM-DD), timestamp (ISO 8601, UTC), timecode (HH:MM:SS:FF), ref (the id of
 *   a record in scope `ref`), enum (one of `options`): a string.
 * - integer, number: a number, in `unit`.
 * - boolean.
 * - length: `Length` from length.ts, metres plus what was typed.
 * - rational: `Rational` from rational.ts, { num, denom }.
 * - dimensions: { width, height }, in `unit`.
 * - stringList: string[].
 */
export type ValueType =
	| 'string'
	| 'date'
	| 'timestamp'
	| 'timecode'
	| 'ref'
	| 'enum'
	| 'integer'
	| 'number'
	| 'boolean'
	| 'length'
	| 'rational'
	| 'dimensions'
	| 'stringList';

/** The unit a value is stored in. Display units are a view: see length.ts. */
export type Unit = 'm' | 'mm' | 'deg' | 'Hz' | 'K' | 'px';

/** What other standards call the field. Absent where the crosswalk found no name. */
export type Names = {
	/** VES CRIF v1.1 column. */
	readonly crif?: string;
	/** CRIF column of the end value. */
	readonly crifEnd?: string;
	/** MovieLabs OMC v2.8 property. */
	readonly omc?: string;
	/** OpenTrackIO 1.0.1 path. */
	readonly otk?: string;
	/** ALE column, per writer. */
	readonly ale?: { readonly avid?: string; readonly arri?: string; readonly silverstack?: string };
	/** UsdGeomCamera attribute. */
	readonly usd?: string;
	/** VES on-set guide section. A reference, not a key: its numbering is not stable. */
	readonly ves?: string;
};

export type FieldDef = {
	readonly scope: Scope;
	readonly key: string;
	readonly type: ValueType;
	readonly unit?: Unit;
	/** Message key of the label. */
	readonly labelKey: string;
	/** The value can change over a take. The end value is stored under `endKey(key)`. */
	readonly end?: true;
	/** False: the value belongs to one take and a new take starts without it. Take scope only. */
	readonly carry?: false;
	readonly required?: true;
	/** Lowest and highest value allowed. For a length, in metres. */
	readonly min?: number;
	readonly max?: number;
	/** The value must be greater than this. */
	readonly above?: number;
	/** A length that may be infinity. */
	readonly infinity?: true;
	/** The values of an enum. Their labels are `<labelKey>.<option>`. */
	readonly options?: readonly string[];
	/** The scope a ref points at. */
	readonly ref?: Scope;
	readonly names?: Names;
};

export const FIELDS = [
	// Project
	{ scope: 'project', key: 'name', type: 'string', labelKey: 'field.project.name', required: true, names: { crif: 'Job', omc: 'CreativeWork', ale: { arri: 'Production', silverstack: 'Production' }, ves: '16.1' } },

	// Shoot day
	{ scope: 'shootDay', key: 'shootDate', type: 'date', labelKey: 'field.shootDay.shootDate', required: true, names: { omc: 'Slate.shootDate', ale: { avid: 'Shoot Date', silverstack: 'Shoot Date' }, ves: '3.3' } },
	{ scope: 'shootDay', key: 'shootDay', type: 'integer', labelKey: 'field.shootDay.shootDay', min: 1, names: { crif: 'Shoot Day', omc: 'Slate.shootDay', ves: '3.3' } },
	{ scope: 'shootDay', key: 'cameraUnit', type: 'string', labelKey: 'field.shootDay.cameraUnit', names: { crif: 'Unit', omc: 'Slate.cameraUnit' } },
	{ scope: 'shootDay', key: 'location', type: 'string', labelKey: 'field.shootDay.location', names: { crif: 'Set Location' } },
	{ scope: 'shootDay', key: 'wrangler', type: 'string', labelKey: 'field.shootDay.wrangler', names: { crif: 'Wrangler' } },

	// Lighting setup
	{ scope: 'lightingSetup', key: 'label', type: 'string', labelKey: 'field.lightingSetup.label', required: true },
	{ scope: 'lightingSetup', key: 'hdri', type: 'boolean', labelKey: 'field.lightingSetup.hdri', names: { crif: 'Set Media', ves: '4.2' } },
	{ scope: 'lightingSetup', key: 'hdriFilename', type: 'string', labelKey: 'field.lightingSetup.hdriFilename', names: { crif: 'HDRI Filename', ves: '4.2' } },
	{ scope: 'lightingSetup', key: 'referenceBalls', type: 'boolean', labelKey: 'field.lightingSetup.referenceBalls', names: { crif: 'Set Media', ves: '4.3' } },
	{ scope: 'lightingSetup', key: 'colourChart', type: 'boolean', labelKey: 'field.lightingSetup.colourChart', names: { ves: '4.1' } },
	{ scope: 'lightingSetup', key: 'notes', type: 'string', labelKey: 'field.lightingSetup.notes' },

	// Camera setup
	{ scope: 'cameraSetup', key: 'cameraLabel', type: 'string', labelKey: 'field.cameraSetup.cameraLabel', required: true, names: { crif: 'Camera Letter', omc: 'cameraLabel', otk: 'static.camera.label', ale: { avid: 'Camera', arri: 'Camera_index', silverstack: 'Camera' } } },
	{ scope: 'cameraSetup', key: 'cameraId', type: 'ref', ref: 'camera', labelKey: 'field.cameraSetup.cameraId' },
	{ scope: 'cameraSetup', key: 'lensId', type: 'ref', ref: 'lens', labelKey: 'field.cameraSetup.lensId' },
	// The place of the setup in every list, set by hand. Never a form field: set by moving the setup.
	{ scope: 'cameraSetup', key: 'order', type: 'integer', labelKey: 'field.cameraSetup.order' },

	// Slate
	{ scope: 'slate', key: 'slateUID', type: 'string', labelKey: 'field.slate.slateUID', required: true, names: { crif: 'Slate', omc: 'Slate.slateUID' } },
	{ scope: 'slate', key: 'sceneNumber', type: 'string', labelKey: 'field.slate.sceneNumber', names: { crif: 'Scene Number', omc: 'ProductionScene.sceneNumber', ale: { avid: 'Scene', arri: 'Scene', silverstack: 'Scene' } } },
	{ scope: 'slate', key: 'setup', type: 'string', labelKey: 'field.slate.setup', names: { omc: 'SlateUID.hasSlateSetup' } },
	{ scope: 'slate', key: 'lightingSetupId', type: 'ref', ref: 'lightingSetup', labelKey: 'field.slate.lightingSetupId' },
	{ scope: 'slate', key: 'description', type: 'string', labelKey: 'field.slate.description', names: { crif: 'Shot Description' } },
	{ scope: 'slate', key: 'vfxShots', type: 'stringList', labelKey: 'field.slate.vfxShots', names: { crif: 'VFX Shot' } },
	{ scope: 'slate', key: 'elementType', type: 'string', labelKey: 'field.slate.elementType', names: { crif: 'Element Type' } },
	{ scope: 'slate', key: 'interiorExterior', type: 'enum', options: ['int', 'ext'], labelKey: 'field.slate.interiorExterior', names: { crif: 'Interior Exterior' } },
	{ scope: 'slate', key: 'scriptTime', type: 'enum', options: ['day', 'night', 'dusk', 'dawn', 'magicHour'], labelKey: 'field.slate.scriptTime', names: { crif: 'Script Time' } },
	{ scope: 'slate', key: 'lidar', type: 'boolean', labelKey: 'field.slate.lidar', names: { ves: '5.1' } },
	{ scope: 'slate', key: 'witnessCamera', type: 'boolean', labelKey: 'field.slate.witnessCamera', names: { crif: 'Set Media', ves: '2.1' } },
	{ scope: 'slate', key: 'cleanPlate', type: 'boolean', labelKey: 'field.slate.cleanPlate', names: { crif: 'Set Media' } },
	{ scope: 'slate', key: 'notes', type: 'string', labelKey: 'field.slate.notes', names: { crif: 'Notes', ves: '1.1' } },

	// Take: identity and time
	{ scope: 'take', key: 'take', type: 'string', labelKey: 'field.take.take', required: true, carry: false, names: { crif: 'Tk Take', omc: 'SlateUID.hasTake', ale: { avid: 'Take', arri: 'Take', silverstack: 'Take' } } },
	{ scope: 'take', key: 'startedAt', type: 'timestamp', labelKey: 'field.take.startedAt', carry: false, names: { crif: 'Tk Start Time Of Take' } },
	{ scope: 'take', key: 'endedAt', type: 'timestamp', labelKey: 'field.take.endedAt', carry: false },
	{ scope: 'take', key: 'circleTake', type: 'boolean', labelKey: 'field.take.circleTake', carry: false, names: { omc: 'circleTake', ale: { silverstack: 'Circled Take' } } },
	{ scope: 'take', key: 'noGood', type: 'boolean', labelKey: 'field.take.noGood', carry: false },
	{ scope: 'take', key: 'notes', type: 'string', labelKey: 'field.take.notes', carry: false, names: { crif: 'Tk Notes', ves: '1.1' } },

	// Take: camera and lens in use
	{ scope: 'take', key: 'cameraSetupId', type: 'ref', ref: 'cameraSetup', labelKey: 'field.take.cameraSetupId' },
	{ scope: 'take', key: 'cameraId', type: 'ref', ref: 'camera', labelKey: 'field.take.cameraId' },
	{ scope: 'take', key: 'lensId', type: 'ref', ref: 'lens', labelKey: 'field.take.lensId' },

	// Take: lens and position
	{ scope: 'take', key: 'focalLength', type: 'number', unit: 'mm', labelKey: 'field.take.focalLength', end: true, above: 0, names: { crif: 'Tk Focal Length', crifEnd: 'Tk Focal Length End', omc: 'focalLength', otk: 'static.lens.nominalFocalLength', usd: 'focalLength', ves: '1.4' } },
	{ scope: 'take', key: 'tStop', type: 'number', labelKey: 'field.take.tStop', above: 0, names: { crif: 'Tk Stop', omc: 'tStop', otk: 'lens.tStop', ale: { silverstack: 'F-Stop' }, usd: 'fStop', ves: '1.1' } },
	{ scope: 'take', key: 'focusDistance', type: 'length', unit: 'm', labelKey: 'field.take.focusDistance', end: true, above: 0, infinity: true, names: { crif: 'Tk Lens Focus', crifEnd: 'Tk Lens Focus End', omc: 'focusPosition', otk: 'lens.focusDistance', usd: 'focusDistance' } },
	{ scope: 'take', key: 'lensHeight', type: 'length', unit: 'm', labelKey: 'field.take.lensHeight', end: true, names: { crif: 'Tk Lens Height', crifEnd: 'Tk Lens Height End', ves: '1.1' } },
	{ scope: 'take', key: 'tilt', type: 'number', unit: 'deg', labelKey: 'field.take.tilt', end: true, min: -90, max: 90, names: { crif: 'Tk Camera Tilt', crifEnd: 'Tk Camera Tilt End', omc: 'tilt', otk: 'transforms[].rotation.tilt', ves: '1.1' } },
	{ scope: 'take', key: 'roll', type: 'number', unit: 'deg', labelKey: 'field.take.roll', end: true, min: -180, max: 180, names: { crif: 'Tk Camera Dutch', crifEnd: 'Tk Camera Dutch End', omc: 'roll', otk: 'transforms[].rotation.roll', ves: '1.1' } },
	{ scope: 'take', key: 'distanceToSubject', type: 'length', unit: 'm', labelKey: 'field.take.distanceToSubject', end: true, min: 0, names: { ves: '1.1' } },

	// Take: exposure
	{ scope: 'take', key: 'captureFrameRate', type: 'rational', unit: 'Hz', labelKey: 'field.take.captureFrameRate', names: { crif: 'Tk FPS', omc: 'captureRate', otk: 'static.camera.captureFrameRate', ale: { arri: 'Sensor_fps', silverstack: 'Sensor Fps' }, ves: '1.1' } },
	{ scope: 'take', key: 'shutterAngle', type: 'number', unit: 'deg', labelKey: 'field.take.shutterAngle', min: 0, max: 360, names: { crif: 'Tk Shutter Angle', omc: 'shutterAngle', otk: 'static.camera.shutterAngle', ale: { arri: 'Shutter_angle', silverstack: 'Shutter' }, ves: '1.2' } },
	{ scope: 'take', key: 'isoSpeed', type: 'integer', labelKey: 'field.take.isoSpeed', min: 1, names: { crif: 'ASA', omc: 'isoSpeed', otk: 'static.camera.isoSpeed', ale: { arri: 'Exposure_index', silverstack: 'ASA' }, usd: 'exposure:iso', ves: '1.3' } },
	{ scope: 'take', key: 'whiteBalance', type: 'integer', unit: 'K', labelKey: 'field.take.whiteBalance', min: 1, names: { crif: 'White Balance', omc: 'whiteBalance', ale: { arri: 'White_balance', silverstack: 'Whitepoint' } } },
	{ scope: 'take', key: 'filter', type: 'string', labelKey: 'field.take.filter', names: { crif: 'Tk Filter', ale: { arri: 'Nd_filterdensity' }, ves: '1.1' } },

	// Take: media
	{ scope: 'take', key: 'cameraRoll', type: 'string', labelKey: 'field.take.cameraRoll', names: { crif: 'Tk Roll', omc: 'Slate.cameraRoll', ale: { avid: 'Camroll', arri: 'Reel_name', silverstack: 'CamRoll' }, ves: '1.1' } },
	{ scope: 'take', key: 'clipName', type: 'string', labelKey: 'field.take.clipName', carry: false, names: { crif: 'Tk Clip Num', ale: { avid: 'Name', arri: 'Name', silverstack: 'Name' } } },
	{ scope: 'take', key: 'timecodeStart', type: 'timecode', labelKey: 'field.take.timecodeStart', carry: false, names: { crif: 'Tk Timecode', omc: 'timecodeStart', otk: 'timing.timecode', ale: { avid: 'Start', arri: 'Start', silverstack: 'Start' } } },
	{ scope: 'take', key: 'timecodeEnd', type: 'timecode', labelKey: 'field.take.timecodeEnd', carry: false, names: { omc: 'timecodeEnd', otk: 'timing.timecode', ale: { avid: 'End', arri: 'End', silverstack: 'End' } } },

	// Camera body
	{ scope: 'camera', key: 'cameraMake', type: 'string', labelKey: 'field.camera.cameraMake', names: { crif: 'Camera Body', omc: 'cameraMake', otk: 'static.camera.make', ale: { arri: 'Manufacturer' }, ves: '1.2' } },
	{ scope: 'camera', key: 'cameraModel', type: 'string', labelKey: 'field.camera.cameraModel', required: true, names: { omc: 'cameraModel', otk: 'static.camera.model', ale: { arri: 'Camera_model' }, ves: '1.2' } },
	{ scope: 'camera', key: 'cameraSerialNumber', type: 'string', labelKey: 'field.camera.cameraSerialNumber', names: { omc: 'cameraSerialNumber', otk: 'static.camera.serialNumber', ale: { arri: 'Camera_sn' } } },
	{ scope: 'camera', key: 'activeSensorPhysicalDimensions', type: 'dimensions', unit: 'mm', labelKey: 'field.camera.activeSensorPhysicalDimensions', names: { omc: 'activeSensorPhysicalDimensions', otk: 'static.camera.activeSensorPhysicalDimensions', usd: 'horizontalAperture', ves: '1.2' } },
	{ scope: 'camera', key: 'activeSensorResolution', type: 'dimensions', unit: 'px', labelKey: 'field.camera.activeSensorResolution', names: { omc: 'frameWidth', otk: 'static.camera.activeSensorResolution', ale: { arri: 'Frame_width', silverstack: 'Resolution' }, ves: '6.1' } },

	// Lens
	{ scope: 'lens', key: 'lensMake', type: 'string', labelKey: 'field.lens.lensMake', names: { omc: 'lensMake', otk: 'static.lens.make', ves: '1.1' } },
	{ scope: 'lens', key: 'lensModel', type: 'string', labelKey: 'field.lens.lensModel', required: true, names: { crif: 'Tk Lens ID', omc: 'lensModel', otk: 'static.lens.model', ale: { arri: 'Lens_type', silverstack: 'Lens' }, ves: '1.1' } },
	{ scope: 'lens', key: 'lensSerialNumber', type: 'string', labelKey: 'field.lens.lensSerialNumber', names: { crif: 'Tk Lens Serial Num', omc: 'lensSerialNumber', otk: 'static.lens.serialNumber', ale: { arri: 'Lens_sn' } } },
	{ scope: 'lens', key: 'focalLength', type: 'number', unit: 'mm', labelKey: 'field.lens.focalLength', above: 0, names: { crif: 'Tk Focal Length', omc: 'focalLength', otk: 'static.lens.nominalFocalLength', usd: 'focalLength', ves: '1.4' } },
	{ scope: 'lens', key: 'focalLengthMax', type: 'number', unit: 'mm', labelKey: 'field.lens.focalLengthMax', above: 0 },
	{ scope: 'lens', key: 'anamorphicSqueeze', type: 'rational', labelKey: 'field.lens.anamorphicSqueeze', names: { omc: 'anamorphicSqueeze', otk: 'static.camera.anamorphicSqueeze', ves: '1.4' } }
] as const satisfies readonly FieldDef[];

/** The key an end value is stored under: tilt → tiltEnd. */
export function endKey(key: string): string {
	return `${key}End`;
}

/** The fields of one scope, in catalogue order. */
export function fieldsOf(scope: Scope): FieldDef[] {
	return (FIELDS as readonly FieldDef[]).filter((d) => d.scope === scope);
}

/** The field stored under `key` in `scope`: its own key, or the end key of a field with an end. */
export function findField(scope: Scope, key: string): { def: FieldDef; end: boolean } | undefined {
	for (const def of FIELDS as readonly FieldDef[]) {
		if (def.scope !== scope) continue;
		if (def.key === key) return { def, end: false };
		if (def.end && endKey(def.key) === key) return { def, end: true };
	}
	return undefined;
}
