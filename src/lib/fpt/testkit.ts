// Fixtures for the tests: a site's schema in the shapes of the corpus (endpoints/get_schema.md,
// endpoints/get_schema_type_fields.md), with the slots of the site read on 2026-11-11.

import { ENTITY_SCOPES, wantedColumns, type EntityScope } from './mapping';
import { planFields, resolveEntities, toResolution, type RawField, type RawFields, type Resolution, type SchemaTypes } from './schema';

export const SITE_URL = 'https://studio.shotgrid.autodesk.com';

const type = (display: string) => ({ name: { value: display, editable: false }, visible: { value: true, editable: false } });

export function siteTypes(): SchemaTypes {
	return {
		Attachment: type('File'),
		Project: type('Project'),
		ShootDay: type('Shoot Day'),
		Slate: type('Slate'),
		Camera: type('Camera'),
		CustomEntity09: type('Take'),
		CustomEntity10: type('Camera Setup'),
		CustomEntity11: type('Lighting Setup'),
		CustomEntity19: type('Lens'),
		CustomEntity29: type('Location'),
		CustomEntity29_sg_scene_Connection: type('Custom Entity29 Sg Scene Connection')
	};
}

export const TYPES: Record<EntityScope, string> = {
	shootDay: 'ShootDay',
	slate: 'Slate',
	camera: 'Camera',
	take: 'CustomEntity09',
	cameraSetup: 'CustomEntity10',
	lightingSetup: 'CustomEntity11',
	lens: 'CustomEntity19'
};

export function rawField(dataType: string, display: string, extra: { unique?: boolean; validTypes?: string[]; editable?: boolean } = {}): RawField {
	return {
		name: { value: display, editable: true },
		data_type: { value: dataType, editable: false },
		editable: { value: extra.editable ?? true, editable: false },
		unique: { value: extra.unique ?? false, editable: false },
		properties: extra.validTypes ? { valid_types: { value: extra.validTypes, editable: true } } : {}
	};
}

/** The fields every entity type has (corpus findings/122_onset_entity_types.md, the common set). */
export function stockFields(): RawFields {
	return {
		code: rawField('text', 'Name'),
		project: rawField('entity', 'Project', { validTypes: ['Project'] }),
		description: rawField('text', 'Description'),
		created_at: rawField('date_time', 'Date Created', { editable: false }),
		notes: rawField('multi_entity', 'Notes', { validTypes: ['Note'] })
	};
}

/** A site with only the stock fields: nothing of ours created yet. */
export function bareFields(): Record<EntityScope, RawFields> {
	const out = {} as Record<EntityScope, RawFields>;
	for (const scope of ENTITY_SCOPES) out[scope] = stockFields();
	return out;
}

/** A site where every field we want is there. */
export function completeFields(): Record<EntityScope, RawFields> {
	const out = bareFields();
	for (const scope of ENTITY_SCOPES) {
		for (const c of wantedColumns(scope)) {
			const target = c.target === 'attachment' ? 'Attachment' : c.target && c.target !== 'project' ? TYPES[c.target] : undefined;
			out[scope][c.name] = rawField(c.dataType, c.display, { unique: c.unique, validTypes: target ? [target] : undefined });
		}
	}
	return out;
}

/** The probed site's habit: Lens.sg_focal_length is a text field of the site's own. */
export function steppedAsideFields(): Record<EntityScope, RawFields> {
	const out = completeFields();
	out.lens.sg_focal_length = rawField('text', 'Focal Length');
	out.lens.sg_onset_focal_length = rawField('float', 'Onset Focal Length');
	return out;
}

/** A bearer shaped as the site's: three base64url segments, the second the claims (findings/027). */
export function jwtWith(claims: Record<string, unknown>): string {
	const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
	return `${b64({ alg: 'HS256' })}.${b64(claims)}.c2lnbmF0dXJl`;
}

const resolve = (fields: Record<EntityScope, RawFields>): Resolution => toResolution(SITE_URL, resolveEntities(siteTypes()), planFields(TYPES, fields))!;

export const RESOLUTION: Resolution = resolve(completeFields());
export const STEPPED_ASIDE: Resolution = resolve(steppedAsideFields());
