// Which takes are selected for a bulk edit, as data. One hand on an iPad: a tap toggles a row,
// a drag down the selection column selects (or clears) the rows it passes, "select range" fills
// from the last row tapped to this one, "select all" takes every row in view. A selection can
// hold rows out of view (another filter); the view decides what is shown. Pure: each function
// returns a new selection.

export type Selection = {
	readonly ids: ReadonlySet<string>;
	/** The last row tapped: where a range starts. */
	readonly anchor?: string;
};

export const EMPTY_SELECTION: Selection = { ids: new Set() };

/** Adds or removes one row; it becomes the anchor. */
export function toggle(sel: Selection, id: string): Selection {
	const ids = new Set(sel.ids);
	if (ids.has(id)) ids.delete(id);
	else ids.add(id);
	return { ids, anchor: id };
}

function span(order: readonly string[], a: string, b: string): string[] | undefined {
	const i = order.indexOf(a);
	const j = order.indexOf(b);
	if (i < 0 || j < 0) return undefined;
	return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** Selects every row from the anchor to `id`, in view order, keeping the rest. No anchor in view: toggles `id`. */
export function extendTo(sel: Selection, order: readonly string[], id: string): Selection {
	const rows = sel.anchor === undefined ? undefined : span(order, sel.anchor, id);
	if (!rows) return toggle(sel, id);
	return { ids: new Set([...sel.ids, ...rows]), anchor: sel.anchor };
}

/**
 * A drag down the selection column, from row `from` to row `to`, over `base` (the selection when
 * the drag began). Started on an unselected row it selects the span; on a selected row it clears
 * it. Call again on every move with the same base: dragging back shrinks the span.
 */
export function dragSpan(base: Selection, order: readonly string[], from: string, to: string): Selection {
	const rows = span(order, from, to);
	if (!rows) return base;
	const ids = new Set(base.ids);
	const clearing = base.ids.has(from);
	for (const id of rows) {
		if (clearing) ids.delete(id);
		else ids.add(id);
	}
	return { ids, anchor: from };
}

/** Every row in view selected, rows out of view kept. */
export function selectAll(sel: Selection, view: readonly string[]): Selection {
	return { ids: new Set([...sel.ids, ...view]), anchor: sel.anchor };
}

/** Whether every row in view is selected. An empty view never is. */
export function isAllSelected(sel: Selection, view: readonly string[]): boolean {
	return view.length > 0 && view.every((id) => sel.ids.has(id));
}

/** Clears the rows in view; with no view, everything. */
export function clearSelection(sel: Selection, view?: readonly string[]): Selection {
	if (!view) return EMPTY_SELECTION;
	const drop = new Set(view);
	return { ids: new Set([...sel.ids].filter((id) => !drop.has(id))), anchor: sel.anchor !== undefined && drop.has(sel.anchor) ? undefined : sel.anchor };
}

/** Drops rows that no longer exist (deleted, undone). The same selection when none is gone. */
export function pruneSelection(sel: Selection, existing: Iterable<string>): Selection {
	const there = new Set(existing);
	const ids = [...sel.ids].filter((id) => there.has(id));
	const anchorGone = sel.anchor !== undefined && !there.has(sel.anchor);
	if (ids.length === sel.ids.size && !anchorGone) return sel;
	return { ids: new Set(ids), ...(anchorGone ? {} : { anchor: sel.anchor }) };
}

/** The selected rows of the view, in view order. */
export function selectedIn(sel: Selection, view: readonly string[]): string[] {
	return view.filter((id) => sel.ids.has(id));
}
