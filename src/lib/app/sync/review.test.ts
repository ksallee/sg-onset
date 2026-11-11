import { describe, expect, it } from 'vitest';
import type { FieldReport, ReverseReport, SetupReport } from '$lib/fpt';
import { setupView } from './report';
import { nextStep, prototypeNote, setupReview } from './review';

const SITE = 'https://studio.shotgrid.autodesk.com';
const WHERE = { site: SITE, project: 'Show' };

const field = (over: Partial<FieldReport>): FieldReport => ({
	scope: 'take',
	entityType: 'CustomEntity09',
	name: 'sg_t_stop',
	displayName: 'T Stop',
	dataType: 'float',
	status: 'missing',
	...over
});

const reverse = (over: Partial<ReverseReport>): ReverseReport => ({
	entityType: 'Slate',
	name: 'sg_takes',
	displayName: 'Take <-> Slate',
	source: 'CustomEntity09.sg_slate',
	status: 'willAppear',
	...over
});

const report = (fields: FieldReport[], reverseFields: ReverseReport[] = []): SetupReport => ({
	ready: false,
	site: SITE,
	entities: [
		{ scope: 'slate', kind: 'builtin', displayName: 'Slate', status: 'found', entityType: 'Slate' },
		{ scope: 'take', kind: 'custom', displayName: 'Take', status: 'found', entityType: 'CustomEntity09' }
	],
	fields,
	reverseFields
});

const review = (fields: FieldReport[], reverseFields: ReverseReport[] = []) => setupReview(setupView(report(fields, reverseFields)), WHERE);

describe('setupReview', () => {
	it('names the site by its host and the Flow PT project', () => {
		const r = review([field({})]);
		expect(r.site).toBe('studio.shotgrid.autodesk.com');
		expect(r.project).toBe('Show');
	});

	it('counts the fields to create, grouped by entity in the order the report has them', () => {
		const r = review([
			field({ name: 'sg_a', scope: 'slate', entityType: 'Slate', displayName: 'Scene Number' }),
			field({ name: 'sg_b' }),
			field({ name: 'sg_c', scope: 'slate', entityType: 'Slate', displayName: 'Setup' }),
			field({ name: 'sg_d', status: 'present' }),
			field({ name: 'sg_e', status: 'blocked' })
		]);
		expect(r.total).toBe(3);
		expect(r.groups.map((g) => [g.entity, g.fields.map((f) => f.name)])).toEqual([
			['Slate', ['sg_a', 'sg_c']],
			['Take', ['sg_b']]
		]);
	});

	it('lists only the reverse fields still to come', () => {
		const r = review([field({})], [reverse({}), reverse({ entityType: 'Slate', name: 'sg_old', status: 'present' })]);
		expect(r.reverse.map((f) => [f.entity, f.name])).toEqual([['Slate', 'sg_takes']]);
	});

	it('shows when fields would be created, and not otherwise', () => {
		expect(review([field({})]).show).toBe(true);
		expect(review([field({ status: 'present' })]).show).toBe(false);
		expect(review([]).show).toBe(false);
	});
});

describe('nextStep', () => {
	const shown = review([field({})]);
	const nothing = review([]);

	it('opens the review on Set Up Fields, and creates nothing yet', () => {
		expect(nextStep('closed', 'request', shown)).toEqual({ step: 'reviewing', run: false });
	});
	it('goes straight on when there is nothing to review', () => {
		expect(nextStep('closed', 'request', nothing)).toEqual({ step: 'closed', run: true });
	});
	it('creates on Set Up Fields in the review', () => {
		expect(nextStep('reviewing', 'confirm', shown)).toEqual({ step: 'closed', run: true });
	});
	it('closes on Not Now, creating nothing', () => {
		expect(nextStep('reviewing', 'notNow', shown)).toEqual({ step: 'closed', run: false });
	});
	it('never creates from a closed review on confirm', () => {
		expect(nextStep('closed', 'confirm', shown)).toEqual({ step: 'closed', run: false });
	});
});

describe('prototypeNote', () => {
	it('shows when signed in and the site is not set up', () => {
		expect(prototypeNote('signed-in', false)).toBe(true);
		expect(prototypeNote('signed-in', true)).toBe(false);
		expect(prototypeNote('signed-out', false)).toBe(false);
		expect(prototypeNote('expired', false)).toBe(false);
	});
});
