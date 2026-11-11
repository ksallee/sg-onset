// The cameras and lenses picked for a setup in this session, newest first: the top of the
// pickers' Recent group, before the gear of the latest takes (setups.ts `recentIds`).
import { pushPick } from './setups';

let cameraPicks = $state<string[]>([]);
let lensPicks = $state<string[]>([]);

export const picks = {
	get cameraId() {
		return cameraPicks;
	},
	get lensId() {
		return lensPicks;
	},
	add(key: 'cameraId' | 'lensId', id: string) {
		if (key === 'cameraId') cameraPicks = pushPick(cameraPicks, id);
		else lensPicks = pushPick(lensPicks, id);
	}
};
