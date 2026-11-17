# Run your own sign-in proxy

Sign-in needs a small server. Flow PT's App Session Launcher answers no CORS, so a page on another
site cannot call it (corpus `findings/062_cors.md`). The app's own server makes those two calls
for the browser. On sg-onset.vercel.app, the sg-onset project runs that server. A studio that
wants it on its own host runs its own deploy. This page says how, for a studio's IT, without
reading the code.

## One deploy

The proxy is two routes inside the app. The same deploy serves the pages and the proxy. The
browser calls `/auth/...` on the address it opened, and the proxy refuses calls from any other
origin. So you run the whole app on your host, and people open your address. There is nothing
else to point.

That is also where the trust sits. The host that serves the app serves the code that holds the
session token. A proxy of your own adds no control while that code comes from another host.

## How sign-in works

1. The person types their Flow PT site. The browser posts it to `/auth/session-request`.
2. The proxy asks the site for a session request and hands back the approval page's address. The
   browser opens that page in a new tab, on the site itself. The person signs in to Flow PT there
   if asked, and approves SG OnSet.
3. Meanwhile the browser posts to `/auth/session-poll` every 2 seconds. The proxy asks the site
   whether the request is approved. Once it is, the site hands out the session token, once, and
   the proxy passes it back.
4. From then on the browser talks to the site directly. It keeps the token on the device and mints
   a 600 s bearer from it at `/api/v1/auth/access_token`, which answers CORS. The proxy is not used
   again until the next sign-in.

A request nobody approves expires after 5 minutes (`findings/052_app_session_launcher.md`).

## What the proxy sees

Per sign-in:

- the site's address;
- the session request's id;
- once, the session token and the person's login (an email on an Autodesk Identity site), in the
  answer to the last poll.

It never sees:

- the person's password: they sign in on the Flow PT site itself;
- the bearer, or anything synced: the browser sends those to the site directly;
- the person's Flow PT cookies: the browser sends them to the site only.

It keeps nothing. The code stores nothing and writes no log; its tests check it never writes to
the console. Every answer carries `cache-control: no-store`. Your host may still log each
request's path, status and caller address. The token is in the body, which those logs leave out
unless you set them up to keep bodies.

## What the proxy checks

On every call:

- Same origin only. A call whose `Origin` header is another address than the deploy's own, or
  marked `sec-fetch-site: cross-site`, is refused. The proxy answers no CORS, so a page on another
  site could not read its answers anyway.
- JSON only, 2 KB at most.
- The site: https and a DNS name. No IP address, no port, no name or password in it, no path, no
  `localhost`, no `.local`, `.internal` or `.arpa` name, no punycode, nothing outside ASCII. Then
  it must be on the allowlist (see Settings).

What it sends the site:

- One of two calls. The method and path come from the code, never from the caller, and are checked
  again just before the call (see Routes).
- The app's name `SG OnSet` and the id `sg-onset`, both fixed. The person sees the name on the
  approval page.
- Two headers of its own, `accept` and `content-type`. None of the caller's: no cookies, no
  `X-Forwarded-Host`. That one matters: the site builds the approval page's address from
  `X-Forwarded-Host` when a call carries it (`findings/130_launcher_answers.md`).

What it reads back:

- Step one: the request's id and the approval page's address, nothing else. The address must be
  the approval page on the very site asked, or the answer is refused.
- Step two: "not yet", or "approved" with the token and the login, nothing else.
- No redirect is followed. An answer over 64 KB is dropped unread. The site gets 10 seconds.

What it does not stop:

- Anyone can call the two routes outside a browser, with `curl` say. They can only ask a site on
  the allowlist to start a session request, which a person signed in to that site must then
  approve. They could call the site's launcher directly anyway: only browsers enforce CORS. The
  proxy gives them nothing more.
- There is no rate limit. Add one in front if your host offers it.

## Routes

Both take a JSON body and answer JSON.

| route | body | call to the site | answer |
|---|---|---|---|
| `POST /auth/session-request` | `{"site": "https://studio.shotgrid.autodesk.com"}` | `POST /internal_api/app_session_request`, form `appName=SG OnSet`, `machineId=sg-onset` | `{"id": "…", "url": "…"}`: `url` is the approval page |
| `POST /auth/session-poll` | `{"site": "https://studio.shotgrid.autodesk.com", "id": "…"}` | `PUT /internal_api/app_session_request/<id>` | `{"approved": false}`, or `{"approved": true, "sessionToken": "…", "userLogin": "…"}` |

The id is letters, digits, `_` and `-`, 128 characters at most.

A refusal is `{"error": "<code>"}`:

| status | error | when |
|---|---|---|
| 400 | `bad-request` | the body is not a JSON object with `site`, and `id` for the poll |
| 400 | `bad-site` | the site's address fails the checks above; `reason` says which |
| 403 | `not-allowed` | the site is not on the allowlist |
| 403 | `cross-origin` | the call came from another origin |
| 413 | `too-large` | the body is over 2 KB |
| 415 | `unsupported-type` | the body is not JSON |
| 404 | `gone` | poll only: the request expired, was refused or was already used |
| 502 | `redirect` | the site answered a redirect |
| 502 | `upstream` | the site answered an error; `upstreamStatus` holds its status |
| 502 | `unreachable` | the site could not be reached, or did not answer within 10 seconds |
| 502 | `bad-answer` | the answer was not what the launcher sends, or was over 64 KB |

SvelteKit answers two cases before the proxy runs: 405 for any method but `POST`, and a plain-text
403 for a form post.

## Settings

One setting, `FPT_EXTRA_HOSTS`. The server reads it from its environment. The browser never sees
it.

The allowlist holds Autodesk-hosted Flow PT by default:

- `*.shotgrid.autodesk.com`
- `*.shotgunstudio.com`

A wildcard matches one label: `studio.shotgrid.autodesk.com` passes,
`a.studio.shotgrid.autodesk.com` does not.

`FPT_EXTRA_HOSTS` adds hosts: exact hosts or `*.domain`, separated by commas or spaces.

    FPT_EXTRA_HOSTS=fpt.studio.com

The same rules as the site apply to each entry. An IP, a port, a local name such as
`fpt.studio.internal`, a bare `*` or `*.com` is dropped without a word, so check the result (see
Check it).

The Autodesk hosts stay allowed whatever you set. To allow your own site only, edit
`DEFAULT_HOST_PATTERNS` in `src/lib/auth/site.ts` in your fork.

A change takes effect when the server restarts: a new deploy on Vercel, a restart on Node. The
app needs no new build: the browser checks only the form of the site, and the allowlist is on the
server. A person who types a site off the list reads: "This app signs in to Autodesk-hosted Flow
PT sites only. A self-hosted deploy can allow others."

If your Flow PT is self-hosted:

- The proxy's host must reach the site. A Vercel deploy cannot reach a site that lives only inside
  your network.
- The browser calls the site's `/api/v1` directly, for the bearer and for sync. Autodesk-hosted
  sites answer CORS there (`findings/062_cors.md`). Nobody has measured a self-hosted site.

## Deploy to Vercel from a fork

The repo is set up for Vercel: `vite.config.ts` uses `@sveltejs/adapter-vercel`, and `vercel.json`
holds the build. Vercel's free Hobby plan is for personal, non-commercial use, so a studio needs a
paid plan.

1. Fork `ksallee/sg-onset` on GitHub, into your studio's account.
2. In Vercel, add a new project and import the fork. Vercel reads `vercel.json`: framework
   SvelteKit, install `pnpm install --frozen-lockfile`, build `pnpm run build`. Leave those.
3. If your site is not Autodesk-hosted, add the environment variable `FPT_EXTRA_HOSTS`, on the
   import screen or later under the project's Settings, Environment Variables.
4. Deploy. Vercel builds `main` only: the `ignoreCommand` in `vercel.json` skips every other
   branch. Keep `main` as the production branch.
5. Add your own domain under the project's Settings, Domains, if you want one.
6. Run the checks under Check it.

Vercel applies a changed variable to new deploys only: redeploy after you change
`FPT_EXTRA_HOSTS`. To take new versions of the app, sync your fork's `main` with
`ksallee/sg-onset`; Vercel builds it.

## Deploy to any Node host

The app builds a plain Node server once the Vercel adapter is swapped for the Node one. You need
Node 22 or 24 and pnpm.

1. Get the code, from your fork of `ksallee/sg-onset`:

       git clone https://github.com/<your-account>/sg-onset.git
       cd sg-onset

2. Swap the adapter:

       pnpm install
       pnpm remove @sveltejs/adapter-vercel
       pnpm add -D @sveltejs/adapter-node@5

   In `vite.config.ts`, change `import adapter from '@sveltejs/adapter-vercel';` to
   `import adapter from '@sveltejs/adapter-node';`. Keep version 5: version 6 needs SvelteKit 3,
   and the app is on SvelteKit 2. Commit the change in your fork, so it stays across updates.
   `vercel.json` does nothing off Vercel.

3. Build:

       pnpm build

   The server is in `build/`.

4. Write a `.env` file beside `package.json`:

       ORIGIN=https://onset.studio.com
       PORT=3000
       FPT_EXTRA_HOSTS=

   `ORIGIN` is the exact address people open: scheme and host, no path. Set it. Without it the
   server builds its address from the request's `Host` header and assumes https. If that differs
   from the address in the browser, every sign-in answers 403 `cross-origin`. `HOST` sets the
   address the server listens on, `0.0.0.0` by default.

5. Run it:

       node --env-file=.env build

   The server does not read `.env` by itself; `--env-file` loads it. It prints the address it
   listens on. Keep it running with what you use already: systemd, pm2, a container.

   Run it from the folder you built in: the server loads some of the app's packages from
   `node_modules`. To run it on another machine, copy `build/`, `package.json`, `pnpm-lock.yaml`
   and `pnpm-workspace.yaml` there, then run `pnpm install --prod --frozen-lockfile`.

6. Put https in front, with nginx, Caddy or your load balancer. The service worker, which opens
   the app offline, needs https.

Another platform needs its own SvelteKit adapter in place of the Vercel one. Nobody has tried one
with this app.

## Point people at it

There is no setting in the app. People open your address in Safari on the iPad and add it to the
Home Screen from there. Sign In then goes through your proxy.

Each address keeps its own data on the device. Someone who used sg-onset.vercel.app starts empty
on yours. To move their work: on the old address, Settings, Backup, Export Backup; on yours,
Settings, Backup, Restore from Backup. Then remove the old icon from the Home Screen, so nobody
signs in through it.

## Check it

Put your address in place of `onset.studio.com`, and your site in place of
`yourstudio.shotgrid.autodesk.com`.

A site off the list is refused:

    curl -i -X POST https://onset.studio.com/auth/session-request \
      -H 'content-type: application/json' \
      -d '{"site": "https://example.com"}'

Expect 403 and `{"error":"not-allowed"}`.

A call from another origin is refused:

    curl -i -X POST https://onset.studio.com/auth/session-request \
      -H 'content-type: application/json' \
      -H 'origin: https://other.example' \
      -d '{"site": "https://yourstudio.shotgrid.autodesk.com"}'

Expect 403 and `{"error":"cross-origin"}`.

Your site is reached:

    curl -i -X POST https://onset.studio.com/auth/session-request \
      -H 'content-type: application/json' \
      -d '{"site": "https://yourstudio.shotgrid.autodesk.com"}'

Expect 200 and an id with the approval page's address on your site:
`{"id":"…","url":"https://yourstudio.shotgrid.autodesk.com/app_session_request/…"}`. This starts
a real request on your site. Nobody approves it, so it expires after 5 minutes.

Then sign in from the app on an iPad.

## Other mentions of sg-onset.vercel.app

`SITE` in `src/lib/app/seo.ts` (the canonical link, the link preview tags, `/sitemap.xml`,
`/llms.txt`) and `static/robots.txt` name sg-onset.vercel.app. They make no calls. Edit them in
your fork if search engines should not be sent there from your deploy.

## The code

| file | what it holds |
|---|---|
| `src/lib/server/launcher-proxy.ts` | the proxy and its checks |
| `src/lib/auth/launcher.ts` | the two calls, and how their answers are read |
| `src/lib/auth/site.ts` | the site check and the allowlist |
| `src/routes/auth/session-request/+server.ts`, `src/routes/auth/session-poll/+server.ts` | the two routes, and where `FPT_EXTRA_HOSTS` is read |
| `src/lib/auth/sign-in.ts` | the browser's half |
