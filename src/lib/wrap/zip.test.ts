import { describe, expect, it } from 'vitest';
import { memorySink, type BackupSink } from '$lib/store/backup';
import { entryBlob, readZip } from '$lib/store/zipRead';
import type { PackageEntry, PackagePlan } from './assembly';
import { zipSize } from './estimate';
import { writePackage } from './zip';

const photo = new Uint8Array(70_000).map((_, i) => i % 251);
function plan(): PackagePlan {
	const entries: PackageEntry[] = [
		{ kind: 'crif', path: 'P_d/P_d_camera-report.csv', mime: 'text/csv', size: 10 },
		{ kind: 'file', media: 'photo', path: 'P_d/1/1-A-reference-1.jpg', mime: 'image/jpeg', size: photo.length, blobId: 'b1' },
		{ kind: 'file', media: 'photo', path: 'P_d/1/1-A-reference-2.jpg', mime: 'image/jpeg', size: photo.length, blobId: 'b2' },
		{ kind: 'folder', path: 'P_d/1/hdri-360/HDRI_0412/', size: 0 }
	];
	return { root: 'P_d', fileName: 'P_d.zip', entries, files: 3, pruned: [], missing: [], photoBytes: photo.length * 2, bytes: zipSize(entries) };
}
const read = async (e: PackageEntry) => (e.kind === 'file' ? new Blob([photo], { type: 'image/jpeg' }) : 'a,b\r\n1,2\r\n');
const now = new Date(2026, 10, 11, 20, 0);

describe('writePackage', () => {
	it('writes every entry under its path, and the bytes as given', async () => {
		const zip = await writePackage(plan(), read, memorySink(), { now });
		const entries = await readZip(zip);
		expect(entries.map((e) => e.name)).toEqual(plan().entries.map((e) => e.path));
		expect(entries).toHaveLength(4);
		expect(await (await entryBlob(zip, entries[0])).text()).toBe('a,b\r\n1,2\r\n');
		expect(new Uint8Array(await (await entryBlob(zip, entries[1])).arrayBuffer())).toEqual(photo);
	});

	it('writes an empty folder as a folder entry, and never asks the reader for it', async () => {
		const asked: string[] = [];
		const zip = await writePackage(plan(), async (e) => (asked.push(e.path), read(e)), memorySink(), { now });
		const folder = (await readZip(zip)).at(-1)!;
		expect(folder).toMatchObject({ name: 'P_d/1/hdri-360/HDRI_0412/', size: 0, compressedSize: 0 });
		expect(asked).not.toContain('P_d/1/hdri-360/HDRI_0412/');
	});

	it('marks the folder entry a folder for every unzip: the name ends in a slash, the mode is a directory', async () => {
		const zip = await writePackage(plan(), read, memorySink(), { now });
		const bytes = new Uint8Array(await zip.arrayBuffer());
		const view = new DataView(bytes.buffer);
		// The last central directory header: the folder's.
		let at = bytes.length - 22;
		while (view.getUint32(at, true) !== 0x02014b50) at--;
		const nameLength = view.getUint16(at + 28, true);
		const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
		expect(name).toBe('P_d/1/hdri-360/HDRI_0412/');
		// Made on Unix, external attributes: S_IFDIR in the high half.
		expect(view.getUint8(at + 5)).toBe(3);
		expect((view.getUint16(at + 40, true) & 0o170000).toString(8)).toBe('40000');
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
		const zip = await writePackage(plan(), async (e) => (e.kind === 'file' && e.blobId === 'b2' ? undefined : read(e)), memorySink(), { now });
		expect((await readZip(zip)).map((e) => e.name)).toHaveLength(3);
	});

	it('stops on cancel, drops what was written and says so', async () => {
		const controller = new AbortController();
		let aborted = false;
		const inner = memorySink();
		const sink: BackupSink = { ...inner, abort: async () => void (aborted = true) };
		const reading = writePackage(
			plan(),
			async (e) => {
				if (e.kind === 'file') controller.abort();
				return read(e);
			},
			sink,
			{ now, signal: controller.signal }
		);
		await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
		expect(aborted).toBe(true);
	});
});
