// A new deploy and the page that is open. The service worker serves the shell from its cache, so
// the first open after a deploy is the old app; the new worker installs behind it and takes over
// (`controllerchange`). What the page does then. Pure.

/**
 * - `ignore`: a first visit; the worker taking over is the first one, there is no older build.
 * - `reload`: load the new build now. Nothing was done in this visit, so nothing is disturbed.
 * - `later`: load it in full on the next in-app navigation. Every edit is saved as it is made.
 */
export type TakeoverAction = 'ignore' | 'reload' | 'later';

export function onTakeover(input: { /** A worker controlled the page when it loaded. */ hadWorker: boolean; /** An edit was made in this visit. */ edited: boolean }): TakeoverAction {
	if (!input.hadWorker) return 'ignore';
	return input.edited ? 'later' : 'reload';
}
