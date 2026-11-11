// The two stamps of a take as the start button reads them (record.ts), epoch ms. No start: ready.
// Start only: running. Both: ended. Types only.

export interface Timing {
	start: number | null;
	end: number | null;
}
