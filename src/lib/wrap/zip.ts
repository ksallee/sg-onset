// Writes a wrap package: the plan's entries, read one at a time, through client-zip into a sink
// (the private file system where the browser has one, so the zip is never held whole in memory).
// Progress as bytes written; an abort signal stops it and drops what was written. Files are
// stored, not compressed: photos do not shrink. A manifest is written from the text it carries.
// An empty folder is a folder entry: client-zip writes a name ending in a slash with a directory
// mode, and every unzip makes the folder.

import { makeZip } from 'client-zip';
import type { BackupSink } from '$lib/store/backup';
import type { PackageEntry, PackagePlan } from './assembly';

/** The bytes of a file: the text made, or the file read from the store. Undefined: skip it. */
export type EntryReader = (entry: Exclude<PackageEntry, { kind: 'folder' | 'manifest' }>) => Promise<Blob | string | undefined>;

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
			if (entry.kind === 'folder') {
				yield { name: entry.path, lastModified: now };
				continue;
			}
			if (entry.kind === 'manifest') {
				yield { name: entry.path, lastModified: now, input: entry.text };
				continue;
			}
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
