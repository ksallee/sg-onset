import { describe, expect, it } from 'vitest';
import { blamedField, failureOf, isPermissionRefusal, isSessionRefusal, isUniqueRefusal, missingRecord, networkKind, statusKind } from './errors';

const envelope = (error: Record<string, unknown>) => ({ errors: [error] });

describe('failureOf', () => {
	it('lifts status, code and title from the errors envelope', () => {
		expect(failureOf(400, envelope({ status: 400, code: 104, title: 'Create failed' }))).toEqual({ status: 400, code: 104, title: 'Create failed' });
	});

	it('prefers the detail of a 404, which names what is missing', () => {
		expect(failureOf(404, envelope({ status: 404, code: 103, title: 'Not Found', detail: "Entity type 'X' does not exist." }))).toEqual({
			status: 404,
			code: 103,
			title: "Entity type 'X' does not exist."
		});
	});

	it('copes with a body that is not the envelope', () => {
		expect(failureOf(502, '<html>Bad Gateway</html>')).toEqual({ status: 502, title: 'HTTP 502' });
		expect(failureOf(400, null)).toEqual({ status: 400, title: 'HTTP 400' });
		expect(failureOf(401, { message: 'Unauthorized' })).toEqual({ status: 401, title: 'Unauthorized' });
	});
});

describe('isUniqueRefusal', () => {
	// corpus findings/127_retry_and_client_uuid.md, verbatim.
	const refused = envelope({
		status: 400,
		code: 104,
		title: 'Create failed for [Version]: The value for the zzprobe 127 client uuid field is required to be unique. <br> ',
		meta: { crud_error_uuid: 'x' }
	});

	it('knows the refusal of a duplicate client UUID', () => {
		expect(isUniqueRefusal(failureOf(400, refused))).toBe(true);
	});

	// corpus findings/field_types/number.md: code 104 is the general create failure.
	it('does not take every code 104 for it', () => {
		const range = envelope({ status: 400, code: 104, title: 'Create failed for [Version]: PG::NumericValueOutOfRange: ERROR:  integer out of range\n' });
		expect(isUniqueRefusal(failureOf(400, range))).toBe(false);
	});
});

describe('missingRecord', () => {
	// corpus recipes/002_batch.md.
	it('reads the type and id out of the 404 of a batch', () => {
		const f = failureOf(404, envelope({ status: 404, title: 'Entity of type [Version] with id=999999999 does not exist.' }));
		expect(missingRecord(f)).toEqual({ entityType: 'Version', id: 999999999 });
	});

	it('is nothing for another 404', () => {
		expect(missingRecord(failureOf(404, envelope({ title: 'Not Found' })))).toBeUndefined();
		expect(missingRecord(failureOf(400, envelope({ title: 'Entity of type [Version] with id=1 does not exist.' })))).toBeUndefined();
	});
});

describe('blamedField', () => {
	// corpus recipes/002_batch.md: the rejection names what it wanted.
	it('reads the type and field a 400 names', () => {
		expect(blamedField(failureOf(400, envelope({ title: 'Invalid field value, update failed [5 - Update failed for [Version.entity]: Value is not legal.]' })))).toEqual({
			entityType: 'Version',
			field: 'entity'
		});
		expect(
			blamedField(
				failureOf(
					400,
					envelope({
						title: 'Invalid field value, update failed [2 - Invalid field name: field [Version.sg_not_a_field] does not exist or user does not have access permission.]'
					})
				)
			)
		).toEqual({ entityType: 'Version', field: 'sg_not_a_field' });
		expect(
			blamedField(failureOf(400, envelope({ title: 'API update() Version.frame_count expected [String, Integer, NilClass] data type(s) but got Float: 2.5' })))
		).toEqual({ entityType: 'Version', field: 'frame_count' });
	});

	it('is nothing when no field is named', () => {
		expect(blamedField(failureOf(400, envelope({ title: 'Request Parameters invalid.' })))).toBeUndefined();
	});
});

describe('isSessionRefusal', () => {
	// corpus findings/126_session_idle.md.
	it('is 400 code 102', () => {
		expect(isSessionRefusal(failureOf(400, envelope({ status: 400, code: 102, title: "Can't authenticate session token ending with '0000'" })))).toBe(true);
		expect(isSessionRefusal(failureOf(400, envelope({ status: 400, code: 103, title: 'x' })))).toBe(false);
	});
});

describe('isPermissionRefusal', () => {
	// corpus findings/094_permission_preflight.md and findings/027_auth_permissions.md.
	it('knows the refusals the corpus measured', () => {
		for (const title of [
			'Entity of type Task cannot be created by this user.',
			'Entity of type Task can not be deleted by this user.',
			'The field is not editable for this user: [Task.content].',
			'Must sudo as Administrator to query license info'
		]) {
			expect(isPermissionRefusal(failureOf(400, envelope({ title }))), title).toBe(true);
		}
		expect(isPermissionRefusal(failureOf(403, null))).toBe(true);
	});

	it('does not take a plain bad request for one', () => {
		expect(isPermissionRefusal(failureOf(400, envelope({ title: "'valid_types' value expected Array with one element" })))).toBe(false);
	});
});

describe('statusKind', () => {
	it('sorts the statuses that are not an answer', () => {
		expect(statusKind(401, 'read')).toBe('unauthorized');
		expect(statusKind(429, 'write')).toBe('failed');
		expect(statusKind(500, 'write')).toBe('failed');
		expect(statusKind(503, 'write')).toBe('failed');
		expect(statusKind(503, 'read')).toBe('failed');
	});

	it('takes a gateway that gave up on a write as maybe landed', () => {
		expect(statusKind(502, 'write')).toBe('timeout');
		expect(statusKind(504, 'write')).toBe('timeout');
		expect(statusKind(504, 'read')).toBe('failed');
	});

	it('leaves an answer alone', () => {
		for (const status of [200, 201, 204, 400, 404, 415]) expect(statusKind(status, 'write')).toBeUndefined();
	});
});

describe('networkKind', () => {
	it('is unreachable when the device is offline: the request never left', () => {
		expect(networkKind({ online: false, aborted: false, mode: 'write' })).toBe('unreachable');
	});

	it('is a timeout when the call was aborted', () => {
		expect(networkKind({ online: true, aborted: true, mode: 'read' })).toBe('timeout');
	});

	it('online: a write may have landed, a read changed nothing', () => {
		expect(networkKind({ online: true, aborted: false, mode: 'write' })).toBe('timeout');
		expect(networkKind({ online: true, aborted: false, mode: 'read' })).toBe('unreachable');
	});
});
