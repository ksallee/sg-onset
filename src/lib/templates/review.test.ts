import { describe, expect, it } from 'vitest';
import { previewTemplateEdit, type Template } from '$lib/model/template';
import type { Take } from '$lib/model/types';
import { templateReview } from './review';

const old: Template<'take'> = { id: 'tpl', name: 'Day ext', scope: 'take', values: { tStop: 2.8, isoSpeed: 800, filter: 'ND.6' } };
const edited: Template<'take'> = { ...old, values: { tStop: 5.6, isoSpeed: 1600, filter: 'ND.6' } };
const takes: Take[] = [
	{ id: 'a', slateId: 's', templateId: 'tpl', tStop: 2.8, isoSpeed: 800 },
	{ id: 'b', slateId: 's', templateId: 'tpl', tStop: 4, isoSpeed: 800 },
	{ id: 'c', slateId: 's', templateId: 'tpl', tStop: 4, isoSpeed: 3200 },
	{ id: 'd', slateId: 's', templateId: 'tpl', tStop: 5.6, isoSpeed: 1600 }
];

describe('templateReview', () => {
	const review = templateReview(previewTemplateEdit(takes, old, edited));

	it('lists each record that would change with its fields, in record order', () => {
		expect(review.records).toEqual([
			{
				id: 'a',
				fields: [
					{ key: 'tStop', from: 2.8, to: 5.6, touched: false },
					{ key: 'isoSpeed', from: 800, to: 1600, touched: false }
				]
			},
			{
				id: 'b',
				fields: [
					{ key: 'tStop', from: 4, to: 5.6, touched: true },
					{ key: 'isoSpeed', from: 800, to: 1600, touched: false }
				]
			},
			{
				id: 'c',
				fields: [
					{ key: 'tStop', from: 4, to: 5.6, touched: true },
					{ key: 'isoSpeed', from: 3200, to: 1600, touched: true }
				]
			}
		]);
	});

	it('counts what each choice changes, and what "only old values" keeps', () => {
		expect(review.untouched).toEqual({ records: 2, fields: 3 });
		expect(review.all).toEqual({ records: 3, fields: 6 });
		expect(review.kept).toEqual({ records: 2, fields: 3 });
	});

	it('sums each field over the records, in the order fields first appear', () => {
		expect(review.byField).toEqual([
			{ key: 'tStop', untouched: 1, touched: 2 },
			{ key: 'isoSpeed', untouched: 2, touched: 1 }
		]);
	});

	it('has no choice to make when nothing was changed by hand', () => {
		const plain = templateReview(previewTemplateEdit([takes[0]], old, edited));
		expect(plain.kept).toEqual({ records: 0, fields: 0 });
		expect(plain.choice).toBe(false);
		expect(review.choice).toBe(true);
	});

	it('is empty when no linked record would change', () => {
		const none = templateReview([]);
		expect(none.all).toEqual({ records: 0, fields: 0 });
		expect(none.records).toEqual([]);
	});
});
