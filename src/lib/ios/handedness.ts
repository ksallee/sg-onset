// Where the parts of a Workspace sit, by the hand that holds the device and the room there is.
// Pure. The rail goes on the edge under the holding thumb, the dock (keypad) beside it, the list
// on the far side; the left hand mirrors every column.

export type Hand = 'left' | 'right';
/** wide: an iPad in landscape. tall: an iPad in portrait. compact: a phone-width window. */
export type Form = 'wide' | 'tall' | 'compact';
export type Area = 'list' | 'main' | 'dock' | 'rail';

export const WIDE_FROM = 1000;
export const TALL_FROM = 700;

export function formFor(width: number): Form {
	if (width >= WIDE_FROM) return 'wide';
	return width >= TALL_FROM ? 'tall' : 'compact';
}

export interface WorkspaceLayout {
	form: Form;
	/** The edge the rail is on. Compact: along the foot, capture on the hand's side. */
	rail: 'left' | 'right' | 'bottom-left' | 'bottom-right';
	/** The list: a column, or a strip on top. */
	list: 'side' | 'top';
	/** The columns, left to right. */
	columns: Area[];
}

export function workspaceLayout(hand: Hand, form: Form): WorkspaceLayout {
	if (form === 'compact') return { form, rail: `bottom-${hand}`, list: 'top', columns: ['main'] };
	const columns: Area[] = form === 'wide' ? ['list', 'main', 'dock', 'rail'] : ['main', 'dock', 'rail'];
	return { form, rail: hand, list: form === 'wide' ? 'side' : 'top', columns: hand === 'right' ? columns : columns.reverse() };
}

/** The Workspace's `grid-template-areas`: the columns; a list strip over all but the rail when on top; one stack when compact. */
export function gridAreas(layout: WorkspaceLayout): string {
	if (layout.form === 'compact') return ['list', 'main', 'dock', 'rail'].map((a) => `"${a}"`).join(' ');
	const row = `"${layout.columns.join(' ')}"`;
	if (layout.list === 'side') return row;
	return `"${layout.columns.map((a) => (a === 'rail' ? 'rail' : 'list')).join(' ')}" ${row}`;
}
