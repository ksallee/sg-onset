// Writes a wrap package: the plan's entries, read one at a time, through client-zip into a sink
// (the private file system where the browser has one, so the zip is never held whole in memory).
// Progress as bytes written; an abort signal stops it and drops what was written. Files are
// stored, not compressed: photos do not shrink.

import { makeZip } from 'client-zip';
import type { BackupSink } from '$lib/store/backup';
import type { PackageEntry, PackagePlan } from './assembly';

/** The bytes of an entry: the text made, or the photo read from the store. Undefined: skip it. */
export type EntryReader = (entry: PackageEntry) => Promise<Blob | string | undefined>;

export type WriteOptions = {
	now: Date;
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
};

const abortError = () => new DOMException('The wrap package was cancelled.', 'AbortError');

export async function writePackage(plan: PackagePlan, read: EntryReader, sink: BackupSink, options: WriteOptions): Promise<Blob> {
	const { signal, now } = options;
	async function* files() {
		for (const entry of plan.entries) {
			if (signal?.aborted) throw abortError();
			const input = await read(entry);
			if (input === undefined) continue;
			yield { name: entry.path, lastModified: now, input };
		}
	}
	const reader = makeZip(files()).getReader();
	let done = 0;
	try {
		options.onProgress?.(0, plan.bytes);
		for (;;) {
			if (signal?.aborted) throw abortError();
			const chunk = await reader.read();
			if (chunk.done) break;
			if (signal?.aborted) throw abortError();
			await sink.write(chunk.value);
			done += chunk.value.length;
			options.onProgress?.(done, plan.bytes);
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		await sink.abort();
		throw signal?.aborted ? abortError() : error;
	}
	return sink.close();
}
