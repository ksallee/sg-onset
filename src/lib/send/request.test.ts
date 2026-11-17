import { describe, expect, it } from 'vitest';
import { MAX_ROWS, pagePath, problemPath, readActionForm, readPage } from './request';

// The form Flow PT posts when a person runs the Action Menu Item, as recorded by probe 156 (corpus
// findings/156_action_menu_item.md): every field, the personal ones included, so the test proves
// they are dropped.
const recorded = (extra: Record<string, string> = {}) =>
	new URLSearchParams({
		user_id: '253',
		user_login: 'ada@studio.example',
		title: 'undefined',
		entity_type: 'Shot',
		server_hostname: 'studio.shotgrid.autodesk.com',
		referrer_path: '/detail/HumanUser/253',
		page_id: '35602',
		session_uuid: '0f8fad5b-d9cb-469f-a165-70867728950e',
		project_name: 'Show',
		project_id: '1180',
		target_column: 'sg_status_list',
		ids: '7609,7642,7851,7852,7853',
		selected_ids: '7851,7852',
		cols: 'image,code,sg_sequence',
		view: 'Default',
		column_display_names: 'Thumbnail,Shot Code,Sequence',
		sort_column: 'code',
		sort_direction: 'asc',
		grouping_column: 'sg_sequence',
		grouping_method: 'exact',
		grouping_direction: 'asc',
		...extra
	});

describe('readActionForm', () => {
	it('keeps the selected rows, the entity type, the project and the site, nothing else', () => {
		expect(readActionForm(recorded(), {})).toEqual({
			ok: true,
			request: { site: 'https://studio.shotgrid.autodesk.com', host: 'studio.shotgrid.autodesk.com', projectId: 1180, entityType: 'Shot', ids: [7851, 7852] }
		});
	});

	it('acts on the selected rows only, never on every row of the page', () => {
		const got = readActionForm(recorded({ selected_ids: '7853' }), {});
		expect(got.ok && got.request.ids).toEqual([7853]);
	});

	it('takes a custom entity slot, the Set Shot one: this server cannot know which slot it is', () => {
		const got = readActionForm(recorded({ entity_type: 'CustomEntity22' }), {});
		expect(got.ok && got.request.entityType).toBe('CustomEntity22');
	});

	it('sorts the ids and keeps each once', () => {
		const got = readActionForm(recorded({ selected_ids: ' 9, 3,9 ,4' }), {});
		expect(got.ok && got.request.ids).toEqual([3, 4, 9]);
	});

	for (const type of ['Asset', 'shot', 'CustomEntity', 'CustomEntity123', 'CustomNonProjectEntity01', 'Shot ', '']) {
		it(`refuses the entity type "${type}"`, () => {
			expect(readActionForm(recorded({ entity_type: type }), {})).toEqual({ ok: false, problem: 'bad-request' });
		});
	}

	for (const ids of ['7851,abc', '7851,,7852', '-1', '0', '1.5', '7851;7852', '12345678901', '0x10']) {
		it(`refuses the selection "${ids}"`, () => {
			expect(readActionForm(recorded({ selected_ids: ids }), {})).toEqual({ ok: false, problem: 'bad-request' });
		});
	}

	for (const project of ['', '0', 'abc', '-3', '1180 ', '01180']) {
		it(`refuses the project "${project}"`, () => {
			expect(readActionForm(recorded({ project_id: project }), {})).toEqual({ ok: false, problem: 'bad-request' });
		});
	}

	it('says when nothing was selected', () => {
		expect(readActionForm(recorded({ selected_ids: '' }), {})).toEqual({ ok: false, problem: 'none-selected' });
		expect(readActionForm(recorded({ selected_ids: ' , ' }), {})).toEqual({ ok: false, problem: 'none-selected' });
		const none = recorded();
		none.delete('selected_ids');
		expect(readActionForm(none, {})).toEqual({ ok: false, problem: 'none-selected' });
	});

	it(`takes ${MAX_ROWS} rows, and refuses more`, () => {
		const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1)).join(',');
		expect(readActionForm(recorded({ selected_ids: ids(MAX_ROWS) }), {}).ok).toBe(true);
		expect(readActionForm(recorded({ selected_ids: ids(MAX_ROWS + 1) }), {})).toEqual({ ok: false, problem: 'too-many' });
	});

	it('checks the site against the same allowlist as sign-in', () => {
		expect(readActionForm(recorded({ server_hostname: 'evil.example' }), {})).toEqual({ ok: false, problem: 'not-allowed' });
		expect(readActionForm(recorded(), { hosts: 'other.shotgrid.autodesk.com' })).toEqual({ ok: false, problem: 'not-allowed' });
		const own = readActionForm(recorded({ server_hostname: 'fpt.studio.com' }), { extraHosts: 'fpt.studio.com' });
		expect(own.ok && own.request.site).toBe('https://fpt.studio.com');
	});

	it('the site is checked before anything else: a site off the list is told so whatever it sent', () => {
		expect(readActionForm(recorded({ server_hostname: 'evil.example', selected_ids: 'x' }), {})).toEqual({ ok: false, problem: 'not-allowed' });
	});

	for (const host of ['192.168.1.10', 'localhost', 'studio.shotgrid.autodesk.com:8080', 'https://studio.shotgrid.autodesk.com/x', 'me@studio.shotgrid.autodesk.com', '']) {
		it(`refuses the site "${host}" as it is`, () => {
			expect(readActionForm(recorded({ server_hostname: host }), {})).toEqual({ ok: false, problem: 'bad-request' });
		});
	}

	it('a field sent twice is refused: there is no telling which one Flow PT meant', () => {
		const twice = recorded();
		twice.append('selected_ids', '1');
		expect(readActionForm(twice, {})).toEqual({ ok: false, problem: 'bad-request' });
	});
});

describe('the page address', () => {
	const request = { site: 'https://studio.shotgrid.autodesk.com', host: 'studio.shotgrid.autodesk.com', projectId: 1180, entityType: 'Shot', ids: [7851, 7852] };

	it('carries the site, the project, the entity type and the ids, and nothing personal', () => {
		const path = pagePath(request);
		expect(path).toBe('/send-set-data?site=studio.shotgrid.autodesk.com&project=1180&type=Shot&ids=7851%2C7852');
		expect(path).not.toMatch(/user|login|session|253/);
	});

	it('reads back what it carries', () => {
		const url = new URL(pagePath(request), 'https://onset.example');
		expect(readPage(url.searchParams)).toEqual({ kind: 'request', request });
	});

	it('a problem is carried alone', () => {
		expect(problemPath('not-allowed')).toBe('/send-set-data?problem=not-allowed');
		expect(readPage(new URL(problemPath('too-many'), 'https://x.example').searchParams)).toEqual({ kind: 'problem', problem: 'too-many' });
	});

	it('nothing at all: the page was opened by hand', () => {
		expect(readPage(new URLSearchParams())).toEqual({ kind: 'none' });
	});

	it('the page checks what it is given again: the address can be typed', () => {
		const bad = (params: Record<string, string>) => readPage(new URLSearchParams({ site: 'studio.shotgrid.autodesk.com', project: '1180', type: 'Shot', ids: '1', ...params }));
		expect(bad({ site: '10.0.0.1' })).toEqual({ kind: 'problem', problem: 'bad-request' });
		expect(bad({ site: 'Studio.ShotGrid.Autodesk.com' })).toEqual({ kind: 'problem', problem: 'bad-request' });
		expect(bad({ project: 'x' })).toEqual({ kind: 'problem', problem: 'bad-request' });
		expect(bad({ type: 'Asset' })).toEqual({ kind: 'problem', problem: 'bad-request' });
		expect(bad({ ids: '' })).toEqual({ kind: 'problem', problem: 'none-selected' });
		expect(bad({ ids: '1,a' })).toEqual({ kind: 'problem', problem: 'bad-request' });
		expect(bad({ problem: 'nonsense' })).toEqual({ kind: 'problem', problem: 'bad-request' });
	});
});
