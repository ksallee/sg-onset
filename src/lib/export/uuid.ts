// Name-based UUIDs (version 5, RFC 9562), so a derived id is the same on every export. CRIF wants
// one SlatesUUID per slate and camera; we hold one UUID per slate. Pure, synchronous: SHA-1 here
// because crypto.subtle is async and not in every test runner.

function rotl(x: number, n: number): number {
	return (x << n) | (x >>> (32 - n));
}

/** SHA-1 of `bytes`, as hex. For ids only, never for security. */
export function sha1Hex(bytes: Uint8Array): string {
	const length = bytes.length;
	const padded = new Uint8Array((((length + 8) >> 6) + 1) * 64);
	padded.set(bytes);
	padded[length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 4, (length * 8) >>> 0);
	view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
	let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
	const w = new Uint32Array(80);
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
		for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
		let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
		for (let i = 0; i < 80; i++) {
			const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
			const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
			[e, d, c, b, a] = [d, c, rotl(b, 30) >>> 0, a, t];
		}
		[h0, h1, h2, h3, h4] = [(h0 + a) >>> 0, (h1 + b) >>> 0, (h2 + c) >>> 0, (h3 + d) >>> 0, (h4 + e) >>> 0];
	}
	return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bytes of a namespace: a UUID's 16 bytes, or any other text as UTF-8. */
function namespaceBytes(ns: string): Uint8Array {
	if (!UUID.test(ns)) return new TextEncoder().encode(ns);
	const hex = ns.replace(/-/g, '');
	return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** The version 5 UUID of `name` in `namespace`. */
export function uuidV5(namespace: string, name: string): string {
	const ns = namespaceBytes(namespace);
	const nm = new TextEncoder().encode(name);
	const input = new Uint8Array(ns.length + nm.length);
	input.set(ns);
	input.set(nm, ns.length);
	const hex = sha1Hex(input).slice(0, 32).split('');
	hex[12] = '5';
	hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	const h = hex.join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
