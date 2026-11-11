// Why a call to FPT went wrong, and how the sync sheet says it. Pure.

import { t } from '$lib/i18n/messages';
import { TransportError, type TransportErrorKind } from '$lib/outbox/transport';

/** A transport's kind of trouble, or `refused`: FPT answered no. */
export type SyncError = { kind: TransportErrorKind | 'refused'; message?: string };

export function syncError(error: unknown): SyncError {
	if (error instanceof TransportError) return { kind: error.kind, message: error.message };
	return { kind: 'refused', message: error instanceof Error ? error.message : String(error) };
}

export function syncErrorText(error: SyncError): string {
	if (error.kind === 'unreachable' || error.kind === 'timeout') return t('sync.error.unreachable');
	if (error.kind === 'unauthorized') return t('sync.error.unauthorized');
	return t('sync.error.failed', { message: error.message ?? error.kind });
}
