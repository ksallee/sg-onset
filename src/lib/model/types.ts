// Record types, one per scope. The fields come from the catalogue, so the two cannot drift: add a
// field in catalogue.ts and it appears here. Every field is optional: a record can be half filled.
// Every record has a client UUID in `id`. Types only.

import type { FIELDS, Scope, ValueType } from './catalogue';
import type { Length } from './length';
import type { Rational } from './rational';

export type Dimensions = { width: number; height: number };

export type FieldValue = string | number | boolean | Length | Rational | Dimensions | string[];

type Stored = {
	string: string;
	date: string;
	timestamp: string;
	timecode: string;
	ref: string;
	enum: string;
	integer: number;
	number: number;
	boolean: boolean;
	length: Length;
	rational: Rational;
	dimensions: Dimensions;
	stringList: string[];
};
/** How a field of each ValueType is stored. */
export type StoredAs<T extends ValueType> = Stored[T];

type Def<S extends Scope> = Extract<(typeof FIELDS)[number], { scope: S }>;

/** The catalogue fields of a scope, with the end keys of the fields that have an end. */
export type FieldsOf<S extends Scope> = {
	-readonly [D in Def<S> as D['key']]?: Stored[D['type']];
} & {
	-readonly [D in Extract<Def<S>, { end: true }> as `${D['key']}End`]?: Stored[D['type']];
};

/** What every record has. */
export type Rec = { id: string };

export type Project = Rec & FieldsOf<'project'>;
export type ShootDay = Rec & { projectId: string } & FieldsOf<'shootDay'>;
export type LightingSetup = Rec & { projectId: string } & FieldsOf<'lightingSetup'>;
/** A, B, C, Second Unit: the body and lens a new take on this camera starts with. */
export type CameraSetup = Rec & { projectId: string } & FieldsOf<'cameraSetup'>;
export type Slate = Rec & { shootDayId: string; templateId?: string } & FieldsOf<'slate'>;
export type Take = Rec & { slateId: string; templateId?: string } & FieldsOf<'take'>;
export type Camera = Rec & { projectId: string } & FieldsOf<'camera'>;
export type Lens = Rec & { projectId: string } & FieldsOf<'lens'>;

/** A reference photo. The file lives in storage, under the still's id. */
export type Still = Rec & { takeId: string; capturedAt: string; caption?: string };

export type RecordOf<S extends Scope> = {
	project: Project;
	shootDay: ShootDay;
	lightingSetup: LightingSetup;
	cameraSetup: CameraSetup;
	slate: Slate;
	take: Take;
	camera: Camera;
	lens: Lens;
}[S];
