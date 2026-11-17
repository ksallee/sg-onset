import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { receiveAction } from './action-route';

const APP = 'https://onset.example';

// The request as probe 156 recorded it from Chrome (corpus findings/156_action_menu_item.md).
const FIELDS: Record<string, string> = {
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
	ids: '7609,7851,7852',
	selected_ids: '7851,7852',
	cols: 'image,code'
};
function post(fields: Record<string, string> = FIELDS, headers: Record<string, string> = {}, body?: string): Request {
	return new Request(`${APP}/action/send-set-data`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'null', 'sec-fetch-site': 'cross-site', ...headers },
		body: body ?? new URLSearchParams(fields).toString()
	});
}
const where = (res: Response) => res.headers.get('location');

let logs: Mock[];
beforeEach(() => {
	logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}) as unknown as Mock);
});
afterEach(() => {
	// The form carries the person's login and session: nothing of it is ever logged.
	for (const log of logs) expect(log).not.toHaveBeenCalled();
	vi.restoreAllMocks();
});

describe('receiveAction', () => {
	it('answers 303 to the page with the four values, and nothing personal', async () => {
		const res = await receiveAction(post(), {});
		expect(res.status).toBe(303);
		expect(where(res)).toBe('/send-set-data?site=studio.shotgrid.autodesk.com&project=1180&type=Shot&ids=7851%2C7852');
		expect(where(res)).not.toMatch(/ada|253|0f8fad5b|Show/);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('referrer-policy')).toBe('no-referrer');
		expect(await res.text()).toBe('');
	});

	it('takes the form whatever the charset says', async () => {
		const res = await receiveAction(post(FIELDS, { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }), {});
		expect(where(res)).toMatch(/^\/send-set-data\?site=/);
	});

	it('a site off the list goes to the page that says so, with nothing of the request', async () => {
		const res = await receiveAction(post({ ...FIELDS, server_hostname: 'evil.example' }), {});
		expect(res.status).toBe(303);
		expect(where(res)).toBe('/send-set-data?problem=not-allowed');
		const own = await receiveAction(post(), { hosts: 'other.shotgrid.autodesk.com' });
		expect(where(own)).toBe('/send-set-data?problem=not-allowed');
		const extra = await receiveAction(post({ ...FIELDS, server_hostname: 'fpt.studio.com' }), { extraHosts: 'fpt.studio.com' });
		expect(where(extra)).toMatch(/site=fpt\.studio\.com/);
	});

	it('nothing selected, too many, or a form it cannot read: the page says which', async () => {
		expect(where(await receiveAction(post({ ...FIELDS, selected_ids: '' }), {}))).toBe('/send-set-data?problem=none-selected');
		expect(where(await receiveAction(post({ ...FIELDS, entity_type: 'Asset' }), {}))).toBe('/send-set-data?problem=bad-request');
		const many = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
		expect(where(await receiveAction(post({ ...FIELDS, selected_ids: many }), {}))).toBe('/send-set-data?problem=too-many');
	});

	it('only a form: JSON or anything else is not what Flow PT sends', async () => {
		const json = await receiveAction(post(FIELDS, { 'content-type': 'application/json' }, JSON.stringify(FIELDS)), {});
		expect(where(json)).toBe('/send-set-data?problem=bad-request');
		const none = await receiveAction(new Request(`${APP}/action/send-set-data`, { method: 'POST', body: 'a=1' }), {});
		expect(where(none)).toBe('/send-set-data?problem=bad-request');
	});

	it('reads a large page of rows, and refuses a body past 1 MiB unread', async () => {
		// `ids` lists every row of the Flow PT page: thousands of ids are a few tens of KB.
		const rows = Array.from({ length: 20_000 }, (_, i) => 100000 + i).join(',');
		expect(where(await receiveAction(post({ ...FIELDS, ids: rows }), {}))).toMatch(/^\/send-set-data\?site=/);
		const huge = await receiveAction(post({ ...FIELDS, cols: 'x'.repeat(1024 * 1024 + 1) }), {});
		expect(where(huge)).toBe('/send-set-data?problem=bad-request');
	});

	it('a declared length past the cap is refused before the body is read', async () => {
		const res = await receiveAction(post(FIELDS, { 'content-length': String(2 * 1024 * 1024) }), {});
		expect(where(res)).toBe('/send-set-data?problem=bad-request');
	});
});
