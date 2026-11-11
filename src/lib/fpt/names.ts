// Field names. Flow Production Tracking takes a display name and derives the `sg_` name from it;
// we choose the display name so the derived name is the one we expect. Pure.

/** A camelCase key as capitalised words: focalLength → Focal Length, slateUID → Slate UID. */
export function displayOf(key: string): string {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(' ');
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * The name the server gives a field created with this display name: lowercased, every character
 * outside a-z, 0-9 and _ becomes one _, nothing is trimmed (corpus
 * findings/117_field_types_and_names.md). A display name with a character outside ASCII loses its
 * whole name to `sg_<data_type>`, so ours are ASCII.
 */
export function codeName(display: string): string {
	return 'sg_' + display.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * A display name made plural, as a reverse field's name has it. The corpus measured custom slots
 * only (`sg_<display name, plural>`); the English rule here is our prediction for the rest:
 * Lens → Lenses, Shoot Day → Shoot Days.
 */
export function pluralOf(display: string): string {
	const text = display.trim();
	if (/(s|x|z|ch|sh)$/i.test(text)) return `${text}es`;
	if (/[^aeiou]y$/i.test(text)) return `${text.slice(0, -1)}ies`;
	return `${text}s`;
}

/** A type's REST slug in the singular: ShootDay is `shoot_day`, CustomEntity09 is `custom_entity09`. */
export function singularSlugOf(entityType: string): string {
	return entityType.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * The field the server adds on each linked type when a link field is created on `sourceType`
 * (corpus findings/142_reverse_field.md, findings/134 for multi-entity):
 * - entity: `sg_<source display name, plural>`, shown `<source display name> <-> <field display name>`.
 * - multi_entity: `<source slug>_<field>_<source slug>s`, shown `<source display name, plural> <-> <field display name>`.
 * Visible and editable, and deleting it deletes the link field too.
 */
export function reverseField(
	sourceType: string,
	sourceDisplay: string,
	field: string,
	fieldDisplay: string,
	dataType: 'entity' | 'multi_entity' | string
): { name: string; displayName: string } {
	const source = sourceDisplay.trim();
	if (dataType === 'multi_entity') {
		const slug = singularSlugOf(sourceType);
		return { name: `${slug}_${field}_${slug}s`, displayName: `${pluralOf(source)} <-> ${fieldDisplay}` };
	}
	return { name: codeName(pluralOf(source)), displayName: `${source} <-> ${fieldDisplay}` };
}

/**
 * How a type is spelled in a REST path: ShootDay is `shoot_days`, CustomEntity19 is
 * `custom_entity19s` (corpus findings/122_onset_entity_types.md; the probe of findings/123
 * addressed a custom entity so). The same rule sg-widgets-core applies, which does not export it.
 */
export function slugOf(entityType: string): string {
	const snake = entityType.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
	if (snake.endsWith('s')) return `${snake}es`;
	if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) return `${snake.slice(0, -1)}ies`;
	return `${snake}s`;
}
