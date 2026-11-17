/**
 * SvelteKit's guard against a form posted from another site, kept as it is for every route but the
 * ones named. Pure.
 *
 * SvelteKit refuses a cross-origin form post with a plain-text 403 before any route runs. Flow PT's
 * Action Menu Item posts a form from another site, with `Origin: null` in the probed Chrome and an
 * origin nobody measured in other browsers (corpus findings/156_action_menu_item.md). So the
 * built-in check is off (`csrf.trustedOrigins: ['*']` in vite.config.ts) and `hooks.server.ts`
 * runs this one: the same rule, with the action route let through. That route writes nothing:
 * it hands four checked values to a page, where the person taps Send (lib/send/request.ts).
 */

/** The content types a browser form sends, as SvelteKit lists them (`is_form_content_type`). */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/x-sveltekit-formdata'];
const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** True when the request is a form posted from another origin to a route that does not take one. */
export function crossSiteForm(request: Request, open: readonly string[]): boolean {
	const type = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	if (!FORM_TYPES.includes(type) || !WRITES.includes(request.method)) return false;
	const url = new URL(request.url);
	if (request.headers.get('origin') === url.origin) return false;
	return !(request.method === 'POST' && open.includes(url.pathname));
}
