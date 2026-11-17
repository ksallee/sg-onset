// The words of the page of "Send set data to artists" (#106), from the `send` area of the catalogue.
// Pure.

import type { SendKind, ShotReport } from '$lib/fpt/sendPlan';
import { t } from '$lib/i18n/messages';
import type { SendFailure, SessionNeed } from './flow';
import { MAX_ROWS, type RequestProblem } from './request';

const plural = (n: number) => (n === 1 ? 'one' : 'other');

/** "2 Shots", "1 Set Shot". */
export function countText(kind: SendKind, n: number): string {
	return t(`send.count.${kind}.${plural(n)}`, { n });
}

/** What Send will do, in a line. */
export function summaryText(input: { kind: SendKind; count: number; notes: boolean }): string {
	const what = input.kind === 'shot' ? t('send.summary.shot') : t(`send.summary.setShot.${plural(input.count)}`);
	const notes = input.notes ? t(`send.summary.notes.${plural(input.count)}`) : '';
	return `${countText(input.kind, input.count)}. ${what}${notes}.`;
}

export function missingText(n: number): string {
	return t(`send.missing.${plural(n)}`, { n });
}

/** What a run did about one Shot, in short sentences. */
export function shotLine(r: ShotReport): string {
	const parts: string[] = [];
	if (r.linked) parts.push(t('send.report.linked'));
	if (!r.setShots) parts.push(t('send.report.noSetShot'));
	else parts.push(r.slates ? t(`send.report.slates.${plural(r.slates)}`, { n: r.slates }) : t('send.report.slates.none'));
	if (r.slatesFailed) parts.push(t('send.report.slatesFailed'));
	if (r.note !== 'waits') parts.push(t(`send.report.note.${r.note}`));
	return parts.join(' ');
}

/** Why the person signs in first. */
export function signInText(need: Exclude<SessionNeed, 'ready'>, host: string, other?: string): string {
	return t(`send.signIn.${need}`, { host, other: other ?? '' });
}

/** A request the page cannot run: from the route, or found on reading the site. */
export type PageProblem = RequestProblem | 'none' | 'type' | 'noSetShot';

export function problemText(problem: PageProblem, entityType = ''): string {
	return t(`send.problem.${problem}`, { max: MAX_ROWS, type: entityType });
}

export function failureText(failure: SendFailure): string {
	return t(`send.failure.${failure}`);
}
