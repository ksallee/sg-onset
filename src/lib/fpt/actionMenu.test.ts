import { describe, expect, it } from 'vitest';
import { ACTION_MENU_ITEM, actionMenuData, actionMenuFilter, actionMenuPlan, actionMenuRowsOf, actionUrl, addProjectData } from './actionMenu';

const TITLE = 'Send set data to artists';
const URL_ = 'https://onset.example/action/send-set-data';
const row = (id: number, values: { title?: string; url?: string; entity_type?: string | null; projects?: number[] }) => ({
	type: ACTION_MENU_ITEM,
	id,
	attributes: { title: values.title ?? TITLE, url: values.url ?? URL_, entity_type: values.entity_type === undefined ? 'Shot' : values.entity_type },
	relationships: { projects: { data: (values.projects ?? []).map((p) => ({ type: 'Project', id: p, name: 'x' })) } }
});

describe('actionUrl', () => {
	it('is the deploy’s own origin and the route, so a deploy of a studio’s own points at itself', () => {
		expect(actionUrl('https://onset.studio.com')).toBe('https://onset.studio.com/action/send-set-data');
		expect(actionUrl('https://onset.studio.com/')).toBe('https://onset.studio.com/action/send-set-data');
		expect(actionUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/action/send-set-data');
	});
});

describe('actionMenuFilter', () => {
	it('finds it again by title and URL', () => {
		expect(actionMenuFilter(TITLE, URL_)).toEqual({
			logical_operator: 'and',
			conditions: [
				['title', 'is', TITLE],
				['url', 'is', URL_]
			]
		});
	});
});

describe('actionMenuRowsOf', () => {
	it('reads the title, URL, entity type and projects of each row', () => {
		expect(actionMenuRowsOf([row(7, { projects: [1, 2] }), row(8, { entity_type: null })])).toEqual([
			{ id: 7, title: TITLE, url: URL_, entityType: 'Shot', projects: [1, 2] },
			{ id: 8, title: TITLE, url: URL_, entityType: null, projects: [] }
		]);
	});
});

describe('actionMenuPlan', () => {
	const plan = (rows: ReturnType<typeof row>[], entityTypes = ['Shot', 'CustomEntity22']) => actionMenuPlan({ entityTypes, projectId: 1, title: TITLE, url: URL_, rows: actionMenuRowsOf(rows) });

	it('none there: one per entity type, to create', () => {
		expect(plan([])).toEqual([
			{ entityType: 'Shot', kind: 'create' },
			{ entityType: 'CustomEntity22', kind: 'create' }
		]);
	});

	it('one there for the project: never twice', () => {
		expect(plan([row(7, { projects: [1] }), row(8, { entity_type: 'CustomEntity22', projects: [3, 1] })])).toEqual([
			{ entityType: 'Shot', kind: 'present', id: 7 },
			{ entityType: 'CustomEntity22', kind: 'present', id: 8 }
		]);
	});

	it('one there for other projects: this project is added to it, never a second one', () => {
		expect(plan([row(7, { projects: [2] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'addProject', id: 7 }]);
		// Projects empty: still added, so the row says where it shows. What Flow PT does with no project is unmeasured.
		expect(plan([row(7, { projects: [] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'addProject', id: 7 }]);
	});

	it('several there: the one with the project, else the oldest', () => {
		expect(plan([row(9, { projects: [2] }), row(7, { projects: [3] }), row(8, { projects: [1] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'present', id: 8 }]);
		expect(plan([row(9, { projects: [2] }), row(7, { projects: [3] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'addProject', id: 7 }]);
	});

	it('a row on another entity type, or under another title or URL, is not ours', () => {
		expect(plan([row(7, { entity_type: 'Asset', projects: [1] }), row(8, { title: 'Other', projects: [1] }), row(9, { url: 'https://other.example/action/send-set-data', projects: [1] })], ['Shot'])).toEqual([
			{ entityType: 'Shot', kind: 'create' }
		]);
	});

	it('matches the title and URL as Flow PT matches text: trimmed, whatever the case (field_types/text.md)', () => {
		expect(plan([row(7, { title: ' send SET data to artists ', url: URL_.toUpperCase(), projects: [1] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'present', id: 7 }]);
	});

	it('the entity type is matched exactly: Flow PT names types in one case only (field_types/entity_type.md)', () => {
		expect(plan([row(7, { entity_type: 'shot', projects: [1] })], ['Shot'])).toEqual([{ entityType: 'Shot', kind: 'create' }]);
	});
});

describe('the writes', () => {
	it('a create sends the title, the URL, the entity type and the project, and leaves the rest as Flow PT sets it', () => {
		// findings/156: the item opens a new tab and posts a form with these defaults, as measured.
		expect(actionMenuData('CustomEntity22', 1, TITLE, URL_)).toEqual({ title: TITLE, url: URL_, entity_type: 'CustomEntity22', projects: [{ type: 'Project', id: 1 }] });
	});

	it('the project is added in place, the mode in the body (recipes/009)', () => {
		expect(addProjectData(1)).toEqual({ projects: { multi_entity_update_mode: 'add', value: [{ type: 'Project', id: 1 }] } });
	});
});
