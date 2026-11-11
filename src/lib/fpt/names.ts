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
