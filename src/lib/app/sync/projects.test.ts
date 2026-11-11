import { describe, expect, it } from 'vitest';
import { projectChoices, PROJECT_FILTER } from './projects';

const row = (id: number, name: unknown) => ({ type: 'Project', id, attributes: { name }, relationships: {} });

describe('projectChoices', () => {
	it('lists the projects by name, then id', () => {
		expect(projectChoices([row(3, 'beta'), row(1, 'Alpha'), row(2, 'alpha')])).toEqual([
			{ id: 1, name: 'Alpha' },
			{ id: 2, name: 'alpha' },
			{ id: 3, name: 'beta' }
		]);
	});
	it('names a project with no name by its id', () => {
		expect(projectChoices([row(7, null), row(8, '  ')])).toEqual([
			{ id: 7, name: '7' },
			{ id: 8, name: '8' }
		]);
	});
});

// corpus findings/018_project_listing.md: sg_status is no liveness flag; the checkboxes are.
describe('PROJECT_FILTER', () => {
	it('leaves out templates, the demo show and archived projects', () => {
		expect(PROJECT_FILTER).toEqual({
			logical_operator: 'and',
			conditions: [
				['is_template', 'is', false],
				['is_demo', 'is', false],
				['archived', 'is', false]
			]
		});
	});
});
