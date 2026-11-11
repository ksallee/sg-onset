// An option of a Segmented control (from holosession's builder/options.ts, the type only).

export interface Option {
	value: string;
	label: string;
	/** A second, dimmer line or tail. */
	sub?: string;
	disabled?: boolean;
}
