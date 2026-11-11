// CRC-32 as zip uses it. The restore checks every file of a backup against it. Pure.

const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	TABLE[n] = c >>> 0;
}

/** The checksum of `bytes`. Pass the result of the chunk before as `previous` to carry on. */
export function crc32(bytes: Uint8Array, previous = 0): number {
	let c = ~previous >>> 0;
	for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return ~c >>> 0;
}
