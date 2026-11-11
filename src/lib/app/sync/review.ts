// The review before Set Up Fields: the site and Flow PT project it acts on, the fields it will
// create by entity, the fields Flow PT adds for the links. Set Up Fields changes the site's schema
// and cannot be undone from the app, so the person sees all of it before anything is written.
// Pure.

import type { AuthStatus } from '$lib/auth/state';
import type { FieldLine, ReverseLine, SetupView } from './report';

export interface ReviewGroup {
	/** The entity's name as the site shows it. */
	entity: string;
	fields: FieldLine[];
}

export interface SetupReview {
	/** Set Up Fields would create something: review first. */
	show: boolean;
	/** The site's host. */
	site: string;
	/** The Flow PT project's name. */
	project: string;
	/** Fields to create. */
	total: number;
	/** Fields to create, by entity, in the report's order. */
	groups: ReviewGroup[];
	/** The fields Flow PT will add for the links. */
	reverse: ReverseLine[];
}

const hostOf = (site: string): string => {
	try {
		return new URL(site).host;
	} catch {
		return site;
	}
};

export function setupReview(view: SetupView, where: { site: string; project: string }): SetupReview {
	const groups: ReviewGroup[] = [];
	for (const f of view.fields.missing) {
		const group = groups.find((g) => g.entity === f.entity);
		if (group) group.fields.push(f);
		else groups.push({ entity: f.entity, fields: [f] });
	}
	const total = view.fields.missing.length;
	return {
		show: total > 0,
		site: hostOf(where.site),
		project: where.project,
		total,
		groups,
		reverse: view.reverse.filter((r) => r.status === 'willAppear')
	};
}

export type ReviewStep = 'closed' | 'reviewing';
/** `request`: Set Up Fields in the setup section. `confirm`: Set Up Fields in the review. */
export type ReviewAction = 'request' | 'confirm' | 'notNow';

/** What a tap does: the review's next step, and whether fields are created now. */
export function nextStep(step: ReviewStep, action: ReviewAction, review: SetupReview): { step: ReviewStep; run: boolean } {
	if (action === 'request') return review.show ? { step: 'reviewing', run: false } : { step: 'closed', run: true };
	if (action === 'confirm' && step === 'reviewing') return { step: 'closed', run: true };
	return { step: 'closed', run: false };
}

/** The early prototype line: signed in, the site not set up yet. */
export function prototypeNote(auth: AuthStatus, ready: boolean): boolean {
	return auth === 'signed-in' && !ready;
}
