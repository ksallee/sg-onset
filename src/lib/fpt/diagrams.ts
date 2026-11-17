// A slate's setup diagram on Flow PT (#87): a PNG, an Attachment in the slate's setup diagram
// field, uploaded as a take's photos are. Found by its file name, which holds the slate's client
// UUID and the file's id, as a photo's does (stills.ts). Pure.

/** An id as it goes in a file name: lowercase, digits, `-` and `_` (findings/135, stills.ts). */
const safe = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]/g, '_');

/** What every image of a slate's diagram is named from. A lookup searches for it. */
export function diagramPrefix(slateId: string): string {
	return `onset_diagram_${safe(slateId)}_`;
}

/** The file name a diagram image is uploaded under. Read-only once uploaded (entity_types/Attachment.md). */
export function diagramFilename(slateId: string, blobId: string): string {
	return `${diagramPrefix(slateId)}${safe(blobId)}.png`;
}

/** What a person sees for the file in Flow PT. */
export const DIAGRAM_SHOWN = 'Setup diagram';
