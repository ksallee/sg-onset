// How much gear a project holds, for the Gear page until the gear screens replace it. Pure.

export interface GearCounts {
	cameras: number;
	lenses: number;
	setups: number;
}

export function gearCounts(cameras: readonly unknown[], lenses: readonly unknown[], setups: readonly unknown[]): GearCounts {
	return { cameras: cameras.length, lenses: lenses.length, setups: setups.length };
}

export function hasGear(counts: GearCounts): boolean {
	return counts.cameras + counts.lenses + counts.setups > 0;
}
