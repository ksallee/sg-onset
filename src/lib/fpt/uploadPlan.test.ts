import { describe, expect, it } from 'vitest';
import { completionInfo, isMultipart, partLink, PART_SIZE, SINGLE_PUT_MAX, URL_LIFE_MS } from './uploadPlan';

describe('upload plan', () => {
	// corpus findings/125_upload_host_cors.md: a PUT at 840 s passed, one at 910 s was refused.
	it('gives a URL 14 minutes', () => {
		expect(URL_LIFE_MS).toBe(840_000);
	});

	// corpus findings/044_multipart_upload.md: every part but the last is at least 5 MiB.
	it('cuts parts above the storage floor', () => {
		expect(PART_SIZE).toBeGreaterThanOrEqual(5 * 1024 * 1024);
	});

	it('sends a file in one PUT up to the limit, in parts above it', () => {
		expect(isMultipart(SINGLE_PUT_MAX)).toBe(false);
		expect(isMultipart(SINGLE_PUT_MAX + 1)).toBe(true);
		expect(isMultipart(100, { singlePutMax: 50, partSize: 60 })).toBe(true);
	});
});

describe('partLink', () => {
	// Shape: corpus endpoints/get_entity_type_id_field_upload_multipart.md.
	const link =
		'/api/v1/entity/custom_entity09s/900/sg_photos/_upload/multipart?filename=onset_ph1_b1.jpg&part_number=2&timestamp=2026-09-04T04%3A41%3A49Z&upload_id=abc.def&upload_type=Attachment';

	it('points a part link at another part and keeps the rest', () => {
		expect(partLink(link, 1)).toBe(link.replace('part_number=2', 'part_number=1'));
		expect(partLink(link, 2)).toBe(link);
		expect(partLink(link, 7)).toContain('part_number=7&timestamp=2026-09-04T04%3A41%3A49Z&upload_id=abc.def');
	});
});

describe('completionInfo', () => {
	const info = { timestamp: 't', upload_type: 'Attachment', upload_id: null, storage_service: 's3', original_filename: 'a.jpg', multipart_upload: false };

	// corpus endpoints/post_entity_type_id_field_upload.md.
	it('is the init reply verbatim for a single PUT', () => {
		expect(completionInfo(info, [{ index: 0, etag: 'e0' }])).toEqual(info);
	});

	it('adds the etags in part order for a multipart upload', () => {
		const multi = { ...info, upload_id: 'u', multipart_upload: true };
		expect(
			completionInfo(multi, [
				{ index: 1, etag: 'e1' },
				{ index: 0, etag: 'e0' }
			])
		).toEqual({ ...multi, etags: ['e0', 'e1'] });
	});

	it('refuses a multipart upload with a part that has no etag', () => {
		const multi = { ...info, upload_id: 'u', multipart_upload: true };
		expect(() => completionInfo(multi, [{ index: 0 }])).toThrow();
	});
});
