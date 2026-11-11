import { describe, expect, it } from 'vitest';
import { memorySink, type BackupSink } from '$lib/store/backup';
import { entryBlob, readZip } from '$lib/store/zipRead';
import type { PackagePlan } from './assembly';
import { zipSize } from './estimate';
import { writePackage } from './zip';

const photo = new Uint8Array(70_000).map((_, i) => i % 251);
function plan(): PackagePlan {
	const entries = [
		{ kind: 'crif' as const, path: 'P_d/P_d_camera-report.csv', mime: 'text/csv', size: 10 },
		{ kind: 'photo' as const, path: 'P_d/photos/1/take-1/1-A-reference-1.jpg', mime: 'image/jpeg', size: photo.length, blobId: 'b1' },
		{ kind: 'photo' as const, path: 'P_d/photos/1/take-1/1-A-reference-2.jpg', mime: 'image/jpeg', size: photo.length, blobId: 'b2' }
	];
	return { root: 'P_d', fileName: 'P_d.zip', entries, pruned: [], missing: [], photoBytes: photo.length * 2, bytes: zipSize(entries) };
}
const read = async (e: PackagePlan['entries'][number]) => (e.kind === 'photo' ? new Blob([photo], { type: 'image/jpeg' }) : 'a,b\r\n1,2\r\n');
const now = new Date(2026, 10, 11, 20, 0);

describe('writePackage', () => {
	it('writes every entry under its path, and the bytes as given', async () => {
		const zip = await writePackage(plan(), read, memorySink(), { now });
		const entries = await readZip(zip);
		expect(entries.map((e) => e.name)).toEqual(plan().entries.map((e) => e.path));
		expect(await (await entryBlob(zip, entries[0])).text()).toBe('a,b\r\n1,2\r\n');
		expect(new Uint8Array(await (await entryBlob(zip, entries[1])).arrayBuffer())).toEqual(photo);
	});

	it('is the size the estimate said', async () => {
		const zip = await writePackage(plan(), read, memorySink(), { now });
		expect(zip.size).toBe(plan().bytes);
	});

	it('reports progress up to the whole', async () => {
		const seen: number[] = [];
		await writePackage(plan(), read, memorySink(), { now, onProgress: (done) => seen.push(done) });
		expect(seen.length).toBeGreaterThan(1);
		expect(seen.every((n, i) => i === 0 || n >= seen[i - 1])).toBe(true);
		expect(seen.at(-1)).toBe(plan().bytes);
	});

	it('skips a photo whose bytes are gone', async () => {
		const zip = await writePackage(plan(), async (e) => (e.kind === 'photo' && e.blobId === 'b2' ? undefined : read(e)), memorySink(), { now });
		expect((await readZip(zip)).map((e) => e.name)).toHaveLength(2);
	});

	it('stops on cancel, drops what was written and says so', async () => {
		const controller = new AbortController();
		let aborted = false;
		const inner = memorySink();
		const sink: BackupSink = { ...inner, abort: async () => void (aborted = true) };
		const reading = writePackage(
			plan(),
			async (e) => {
				if (e.kind === 'photo') controller.abort();
				return read(e);
			},
			sink,
			{ now, signal: controller.signal }
		);
		await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
		expect(aborted).toBe(true);
	});
});
