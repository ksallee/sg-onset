// A back button's label, as iOS shortens it: the previous screen's title while it fits beside
// the centred title, else "Back".

/** Characters a back label keeps at 390 px (17 px text, a 200 px title between). */
export const BACK_MAX = 10;

export function backLabel(title: string): string {
	const t = title.trim();
	return t && t.length <= BACK_MAX ? t : 'Back';
}
