// Recovery after "timed out, but it may have committed". The server ignores idempotency keys and
// an abandoned batch can still commit, so an attempt with no answer is never resent blind: the
// runner gathers evidence and this module judges it. Pure.

import { sameValue } from '$lib/model/value';
import type { Entry, RemoteId } from './types';

export type Evidence = {
	/** Create, delete: the server's id for the client UUID, when a lookup found it. */
	found?: RemoteId;
	/** Update: the server's values of the fields we sent. Absent: the server has no such record. */
	server?: Record<string, unknown>;
	/** Upload: the file is on the server, whole. */
	verified?: boolean;
	/** Upload: the id of the verified file, when the check names one. */
	remoteId?: RemoteId;
};

/** Did the attempt land. */
export function judge(entry: Entry, evidence: Evidence): { applied: boolean; remoteId?: RemoteId } {
	const op = entry.op;
	switch (op.kind) {
		case 'create':
			return evidence.found !== undefined ? { applied: true, remoteId: evidence.found } : { applied: false };
		case 'delete':
			return { applied: evidence.found === undefined };
		case 'update': {
			const server = evidence.server;
			if (!server) return { applied: false };
			return { applied: Object.entries(op.changes).every(([key, c]) => sameValue(server[key], c.value)) };
		}
		case 'blob':
			if (!evidence.verified) return { applied: false };
			return evidence.remoteId !== undefined ? { applied: true, remoteId: evidence.remoteId } : { applied: true };
	}
}
