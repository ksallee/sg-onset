// The flattened copy of a photo: the photo, then its drawing painted over it, as a JPEG at the
// photo's own size. The browser edge of the flattener: it decodes, paints and encodes. The
// geometry and the paint order are pure (geometry.ts, paint.ts); the e2e test covers this.

import { flatSize } from './geometry';
import type { Markup } from './markup';
import { paint, typedText } from './paint';

/** The largest canvas iPadOS Safari paints: 16,777,216 pixels. A larger photo is flattened smaller. */
export const MAX_PIXELS = 16_777_216;

/** An image element turns the photo as its EXIF orientation says, as the screen shows it. */
async function decode(photo: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(photo);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function flattenPhoto(photo: Blob, markup: Markup): Promise<Blob> {
	const img = await decode(photo);
	const size = flatSize(img.naturalWidth, img.naturalHeight, MAX_PIXELS);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('No 2D canvas');
	ctx.drawImage(img, 0, 0, size.width, size.height);
	ctx.scale(size.width / markup.width, size.height / markup.height);
	// A measurement shows as it was typed: the image is a note, whatever the units setting.
	paint(ctx, markup.shapes, { value: typedText });
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
	canvas.width = canvas.height = 0;
	if (!blob) throw new Error('The canvas gave no image');
	return blob;
}
