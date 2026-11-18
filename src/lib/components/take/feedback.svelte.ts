// Motion as feedback on the take screen (#52): a part answers when what it shows changed, after the
// change has landed. `{@attach feedback(() => key, frames)}` runs `frames` on the element each time
// `key` changes to a value that is not null, never when it first shows. The kit's spring does it:
// transform and opacity, from where the element is drawn, in place of a run still going, and
// nothing under reduced motion (components/ios/motion.ts). Nothing waits on it.
import type { Attachment } from 'svelte/attachments';
import { animateSpring } from '$lib/components/ios/motion';
import type { SpringName } from '$lib/theme/motion';

export function feedback(key: () => unknown, frames: Keyframe[], spring: SpringName = 'snappy'): Attachment<Element> {
	return (node) => {
		let first = true;
		let last: unknown;
		$effect(() => {
			const now = key();
			if (first) {
				first = false;
				last = now;
				return;
			}
			if (now === last) return;
			last = now;
			if (now !== null && now !== undefined) animateSpring(node, frames, spring);
		});
	};
}

/** A number that is new: it settles from a little below. Readable on the first frame. */
export const SETTLE: Keyframe[] = [{ transform: 'translateY(0.12em)' }, { transform: 'none' }];
/** A value just stored: it gives a little and comes back. */
export const STORED: Keyframe[] = [{ transform: 'scale(1.1)' }, { transform: 'none' }];
/** A part just picked: it grows into place. */
export const PICKED: Keyframe[] = [{ transform: 'scale(0.9)' }, { transform: 'none' }];
