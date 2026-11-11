import { describe, expect, it } from 'vitest';
import {
	bearerRefusal,
	blamedField,
	failureOf,
	isFieldCreateRefusal,
	isPermissionRefusal,
	isSessionRefusal,
	isUniqueRefusal,
	missingRecord,
	networkKind,
	rowRefusal,
	statusKind
} from './errors';

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

// corpus findings/133_bearer_expiry.md: every bearer refusal is 401 code 102 `Unauthorized`; `detail`
// tells them apart.
describe('bearerRefusal', () => {
	const unauthorized = (detail: string | null) => failureOf(401, envelope({ id: 'x', status: 401, code: 102, title: 'Unauthorized', source: null, detail, meta: null }));

	it('knows a spent bearer, which a new one fixes', () => {
		expect(bearerRefusal(unauthorized('Token Expired'))).toBe('expired');
	});

	it('takes a forged token or none as unauthorized', () => {
		expect(bearerRefusal(unauthorized('Token invalid'))).toBe('invalid');
		expect(bearerRefusal(unauthorized(null))).toBe('invalid');
	});

	it('is nothing for an answer that is not a bearer refusal', () => {
		expect(bearerRefusal(failureOf(400, envelope({ status: 400, code: 102, title: 'x' })))).toBeUndefined();
		expect(bearerRefusal(failureOf(401, envelope({ status: 401, code: 110, title: 'Must sudo' })))).toBeUndefined();
	});
});

// corpus findings/132_field_create_rights.md: an Artist creating a field.
describe('isFieldCreateRefusal', () => {
	const title = "API schema_field_create() RuntimeError: User doesn't have permission to create a Field";
	const traceback = "{traceback: \"/var/rails/shotgun/current/app/models/display_column.rb:2764:in 'block in DisplayColumn.create_column'\"}";

	it('matches the measured answer, and reads its title past the traceback', () => {
		const failure = failureOf(500, envelope({ status: 500, code: 105, title, detail: traceback }));
		expect(failure.title).toBe(title);
		expect(isFieldCreateRefusal(failure)).toBe(true);
	});

	it('is not a passing 500, nor another create failure', () => {
		expect(isFieldCreateRefusal(failureOf(500, envelope({ status: 500, code: 105, title: 'Only true or false allowed in checkbox' })))).toBe(false);
		expect(isFieldCreateRefusal(failureOf(500, null))).toBe(false);
		expect(isFieldCreateRefusal(failureOf(400, envelope({ status: 400, code: 105, title: 'API schema_field_create() failed, there is a retired field' })))).toBe(false);
	});
});

// corpus findings/143_nonadmin_rows.md: an Artist on custom-entity rows and Attachments.
describe('rowRefusal', () => {
	const refused = (title: string) => failureOf(400, envelope({ status: 400, code: 104, title }));

	it('reads what was refused, and on which type', () => {
		expect(rowRefusal(refused('Entity of type CustomEntity09 cannot be created by this user.'))).toEqual({ action: 'create', entityType: 'CustomEntity09' });
		expect(rowRefusal(refused('Entity of type Attachment can not be deleted by this user.'))).toEqual({ action: 'delete', entityType: 'Attachment' });
		expect(rowRefusal(refused('The field is not editable for this user: [CustomEntity09.code].'))).toEqual({ action: 'update', entityType: 'CustomEntity09', field: 'code' });
	});

	it('is nothing for another refusal', () => {
		expect(rowRefusal(refused('Create failed for [CustomEntity09]: The value for the Onset UUID field is required to be unique. <br> '))).toBeUndefined();
		expect(rowRefusal(failureOf(500, envelope({ status: 500, code: 104, title: 'Entity of type X cannot be created by this user.' })))).toBeUndefined();
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
