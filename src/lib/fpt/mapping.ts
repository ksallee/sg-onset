// The mapping: which Flow Production Tracking field holds each key of our records. Derived from
// the model's field catalogue, so a new catalogue field is mapped with no line here, or with one
// line in OVERRIDES when its name or place needs a say. Pure.
//
// Our keys are OMC and OpenTrackIO camelCase in metric units; the FPT names are this table.
// The real name on a site can differ from the one here: see schema.ts, which steps aside to an
// `sg_onset_` name when a site already uses the plain one for something else.

import { endKey, FIELDS, type FieldDef, type Unit } from '$lib/model/catalogue';
import { codeName, displayOf } from './names';

/** The scopes that are records on the server. The project is not ours to write. */
export const ENTITY_SCOPES = ['shootDay', 'lightingSetup', 'cameraSetup', 'slate', 'take', 'camera', 'lens'] as const;
export type EntityScope = (typeof ENTITY_SCOPES)[number];

export function isEntityScope(name: string): name is EntityScope {
	return (ENTITY_SCOPES as readonly string[]).includes(name);
}

/** What an entity field points at. */
export type Target = EntityScope | 'project' | 'attachment';

/** The FPT data types we use. Each is creatable with a name (corpus endpoints/post_schema_type_fields.md). */
export type FptDataType = 'text' | 'float' | 'number' | 'checkbox' | 'date' | 'date_time' | 'entity' | 'multi_entity';

export type Column = {
	/** The stock field name, or the `sg_` name we ask for. */
	readonly name: string;
	/** The display name a created field gets. `codeName(display)` is `name`. */
	readonly display: string;
	readonly dataType: FptDataType;
	/** A field every entity has: `code`, `description`, `project`. Never created. */
	readonly stock?: true;
	/** Created `unique: true`: the retry guard (corpus findings/127_retry_and_client_uuid.md). */
	readonly unique?: true;
	/** For `entity` and `multi_entity`. */
	readonly target?: Target;
	/** For the field's description on the site: the unit, or what the field is for. */
	readonly note?: string;
};

/** How a value crosses: see convert.ts. `ref` is a link, resolved in payload.ts. */
export type Kind = 'text' | 'stringList' | 'rational' | 'date' | 'timestamp' | 'integer' | 'number' | 'boolean' | 'length' | 'dimensions' | 'ref';

export type FieldMap = {
	readonly scope: EntityScope;
	/** Our key. */
	readonly key: string;
	readonly kind: Kind;
	/** One field, or two for dimensions. */
	readonly columns: readonly Column[];
	/** The value also names the record: written to `code` as well. One way. */
	readonly alsoCode?: true;
	/** A length that may be infinity. */
	readonly infinity?: true;
};

/**
 * The entity type of each scope. Built-in types go by schema name. Custom entities go by display
 * name, never by `CustomEntityNN`: every site uses different slots (corpus
 * findings/008_custom_entities.md).
 */
export const ENTITY_TYPES: Record<
	EntityScope,
	{ kind: 'builtin'; entityType: string; displayName: string } | { kind: 'custom'; displayName: string; aliases?: readonly string[] }
> = {
	shootDay: { kind: 'builtin', entityType: 'ShootDay', displayName: 'Shoot Day' },
	slate: { kind: 'builtin', entityType: 'Slate', displayName: 'Slate' },
	camera: { kind: 'builtin', entityType: 'Camera', displayName: 'Camera' },
	take: { kind: 'custom', displayName: 'Take' },
	lens: { kind: 'custom', displayName: 'Lens', aliases: ['Lenses'] },
	cameraSetup: { kind: 'custom', displayName: 'Camera Setup' },
	lightingSetup: { kind: 'custom', displayName: 'Lighting Setup' }
};

/** The client UUID, on every entity we write. A create sent twice is refused on it. */
export const UUID: Column = { name: 'sg_onset_uuid', display: 'Onset UUID', dataType: 'text', unique: true, note: 'The record id on the device. Unique: a create sent twice is refused.' };

/** The photos of a take: Attachments at full resolution (corpus findings/123_photos_per_record.md). */
export const STILLS: Column = { name: 'sg_stills', display: 'Stills', dataType: 'multi_entity', target: 'attachment', note: 'Reference photos, as shot.' };

/** The key whose value a new record takes as `created_at` (corpus findings/070_authored_timestamps.md). */
export const CREATED_AT: Partial<Record<EntityScope, string>> = { take: 'startedAt' };

const STOCK: Record<'code' | 'description' | 'project', Column> = {
	code: { name: 'code', display: 'Name', dataType: 'text', stock: true },
	description: { name: 'description', display: 'Description', dataType: 'text', stock: true },
	project: { name: 'project', display: 'Project', dataType: 'entity', stock: true, target: 'project' }
};

type Override = {
	/** Use a stock field instead of creating one. */
	stock?: 'code' | 'description';
	/** The display name, when the key does not make a good one. */
	display?: string;
	/** Display names of the width and the height field of dimensions. */
	displays?: readonly [string, string];
	alsoCode?: true;
};

/**
 * Where the derived name is not the one we want. `<scope>.<key>`, or `*.<key>` for every scope.
 * Everything else is derived: `focalLength` is "Focal Length", `sg_focal_length`.
 */
const OVERRIDES: Record<string, Override> = {
	// The name of each record lives in the stock `code`, which every type has (corpus findings/122).
	'lightingSetup.label': { stock: 'code' },
	'cameraSetup.cameraLabel': { stock: 'code' },
	'slate.slateUID': { stock: 'code' },
	'take.take': { stock: 'code' },
	'camera.cameraModel': { stock: 'code' },
	'lens.lensModel': { stock: 'code' },
	'slate.description': { stock: 'description' },
	// A shoot day is named by its date, and keeps the date as a date too.
	'shootDay.shootDate': { alsoCode: true },
	'shootDay.shootDay': { display: 'Day Number' },
	// The stock `notes` field links Note records; ours is text.
	'*.notes': { display: 'Set Notes' },
	'lightingSetup.hdri': { display: 'HDRI' },
	'lightingSetup.hdriFilename': { display: 'HDRI Filename' },
	'slate.vfxShots': { display: 'VFX Shots' },
	'slate.lidar': { display: 'LiDAR' },
	'take.isoSpeed': { display: 'ISO' },
	'camera.activeSensorPhysicalDimensions': { displays: ['Sensor Width mm', 'Sensor Height mm'] },
	'camera.activeSensorResolution': { displays: ['Sensor Resolution Width', 'Sensor Resolution Height'] }
};

const KIND: Record<FieldDef['type'], Kind> = {
	string: 'text',
	enum: 'text',
	timecode: 'text',
	date: 'date',
	timestamp: 'timestamp',
	ref: 'ref',
	integer: 'integer',
	number: 'number',
	boolean: 'boolean',
	length: 'length',
	rational: 'rational',
	dimensions: 'dimensions',
	stringList: 'stringList'
};

/**
 * - A rational is text, `24000/1001`: lossless, and FPT has no rational.
 * - A timecode and an enum are text: the timecode keeps its frames, the enum its key.
 * - A list of strings is one text, comma-separated.
 */
const DATA_TYPE: Record<Kind, FptDataType> = {
	text: 'text',
	stringList: 'text',
	rational: 'text',
	date: 'date',
	timestamp: 'date_time',
	integer: 'number',
	number: 'float',
	boolean: 'checkbox',
	length: 'float',
	dimensions: 'float',
	ref: 'entity'
};

const UNIT_NOTE: Record<Unit, string> = { m: 'Metres', mm: 'mm', deg: 'deg', Hz: 'Hz', K: 'K', px: 'px' };

function column(display: string, dataType: FptDataType, extra: Partial<Column> = {}): Column {
	return { name: codeName(display), display, dataType, ...extra };
}

function noteOf(def: FieldDef, kind: Kind): string | undefined {
	if (kind === 'rational') return def.unit ? `num/denom, ${UNIT_NOTE[def.unit]}` : 'num/denom';
	if (kind === 'length') return 'Metres';
	return def.unit ? UNIT_NOTE[def.unit] : undefined;
}

function mapsOf(def: FieldDef): FieldMap[] {
	const scope = def.scope as EntityScope;
	const override = OVERRIDES[`${scope}.${def.key}`] ?? OVERRIDES[`*.${def.key}`] ?? {};
	const kind = KIND[def.type];
	const note = noteOf(def, kind);
	const extra = note ? { note } : {};
	const rest = { ...(override.alsoCode ? { alsoCode: true as const } : {}), ...(def.infinity ? { infinity: true as const } : {}) };

	const columnsFor = (end: boolean): Column[] => {
		if (override.stock) return [STOCK[override.stock]];
		if (kind === 'ref') return [column(displayOf(def.key.replace(/Id$/, '')), 'entity', { target: def.ref as Target })];
		if (kind === 'dimensions') {
			const dataType = def.unit === 'px' ? 'number' : 'float';
			const base = override.display ?? displayOf(def.key);
			const [width, height] = override.displays ?? [`${base} Width`, `${base} Height`];
			return [column(width, dataType, extra), column(height, dataType, extra)];
		}
		const base = (override.display ?? displayOf(def.key)) + (end ? ' End' : '');
		// A length says its unit in its name: a crew that thinks in feet must not read metres as feet.
		return [column(kind === 'length' ? `${base} m` : base, DATA_TYPE[kind], extra)];
	};

	const maps: FieldMap[] = [{ scope, key: def.key, kind, columns: columnsFor(false), ...rest }];
	if (def.end) maps.push({ scope, key: endKey(def.key), kind, columns: columnsFor(true), ...rest });
	return maps;
}

/** The keys of a record that are not catalogue fields: the parent, and the template it came from. */
const RECORD_KEYS: Record<EntityScope, FieldMap[]> = (() => {
	const project = (scope: EntityScope): FieldMap => ({ scope, key: 'projectId', kind: 'ref', columns: [STOCK.project] });
	const parent = (scope: EntityScope, key: string, target: EntityScope): FieldMap => ({
		scope,
		key,
		kind: 'ref',
		columns: [column(displayOf(key.replace(/Id$/, '')), 'entity', { target })]
	});
	// The template link is the id of a record on the device. Kept as text so no edit is lost.
	const template = (scope: EntityScope): FieldMap => ({
		scope,
		key: 'templateId',
		kind: 'text',
		columns: [column('Onset Template', 'text', { note: 'The template this record was made from, by its id on the device.' })]
	});
	return {
		shootDay: [project('shootDay')],
		lightingSetup: [project('lightingSetup')],
		cameraSetup: [project('cameraSetup')],
		camera: [project('camera')],
		lens: [project('lens')],
		slate: [parent('slate', 'shootDayId', 'shootDay'), template('slate')],
		take: [parent('take', 'slateId', 'slate'), template('take')]
	};
})();

const MAPS: Record<EntityScope, FieldMap[]> = (() => {
	const out = {} as Record<EntityScope, FieldMap[]>;
	for (const scope of ENTITY_SCOPES) {
		out[scope] = [...RECORD_KEYS[scope], ...(FIELDS as readonly FieldDef[]).filter((d) => d.scope === scope).flatMap(mapsOf)];
	}
	return out;
})();

/** Every mapped key of a scope: the record keys, then the catalogue fields in catalogue order. */
export function fieldMaps(scope: EntityScope): FieldMap[] {
	return MAPS[scope];
}

export function fieldMap(scope: EntityScope, key: string): FieldMap | undefined {
	return MAPS[scope].find((m) => m.key === key);
}

/** The fields a scope's entity must have that are not stock: ours to find or create. */
export function wantedColumns(scope: EntityScope): Column[] {
	const own = MAPS[scope].flatMap((m) => m.columns).filter((c) => !c.stock);
	return [UUID, ...own, ...(scope === 'take' ? [STILLS] : [])];
}

/** The mapping as rows, for the README and for a person checking it. */
export function mappingTable(): { scope: EntityScope; key: string; field: string; dataType: string; note: string }[] {
	return ENTITY_SCOPES.flatMap((scope) =>
		MAPS[scope].map((m) => ({
			scope,
			key: m.key,
			field: m.columns.map((c) => c.name).join(', ') + (m.alsoCode ? ', code' : ''),
			dataType: [...new Set(m.columns.map((c) => c.dataType))].join(', '),
			note: m.columns[0].note ?? ''
		}))
	);
}
