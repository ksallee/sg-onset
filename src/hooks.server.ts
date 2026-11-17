// The shell carries the head tags for its path (`$lib/app/seo`): the app renders in the browser
// only, and a link preview never runs it.
//
// A form posted from another site is refused here, as SvelteKit's own check did, except Flow PT's
// post to the action route (#106, `$lib/server/csrf.ts`). SvelteKit's check is off in vite.config.ts.
import type { Handle } from '@sveltejs/kit';
import { headFor } from '$lib/app/seo';
import { crossSiteForm } from '$lib/server/csrf';
import { ACTION_PATH } from '$lib/send/request';

export const handle: Handle = ({ event, resolve }) => {
	if (crossSiteForm(event.request, [ACTION_PATH])) {
		const message = `Cross-site ${event.request.method} form submissions are forbidden`;
		return event.request.headers.get('accept') === 'application/json'
			? Response.json({ message }, { status: 403 })
			: new Response(message, { status: 403, headers: { 'content-type': 'text/plain' } });
	}
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%seo.head%', headFor(event.url.pathname))
	});
};
