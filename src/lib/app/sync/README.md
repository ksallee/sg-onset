# app/sync

Sync to Flow PT, wired into the app: the project link, the setup check, the runner, the status.
The outbox (`$lib/outbox`) and the transport (`$lib/fpt`) do the work; this holds them together.

## Modules

| module | pure | what it does |
|---|---|---|
| `status.ts` | yes | `syncStatus`: the state the shell shows, from account, link, setup, network, queue. |
| `link.ts` | yes | `ProjectLink`, its stored form, `linkOn` (same site only), `linkProblem`. |
| `links.ts` | port | `linkStore`: the links over a key-value port. |
| `report.ts` | yes | `setupView`: `checkSetup`'s report as the sheet shows it. |
| `review.ts` | yes | `setupReview`, `nextStep`: the review before Set Up Fields; `prototypeNote`. |
| `queue.ts` | yes | `pendingByKind`, `scopedUpdate`, `parentOf`, `conflictLines`. |
| `projects.ts` | yes | `PROJECT_FILTER`, `projectChoices`: the FPT projects a person picks from. |
| `errors.ts` | yes | `syncError`, `syncErrorText`. |
| `clock.ts` | yes | `toSecond`: `app.now()` stamps to the second. |
| `scope.ts` | no | `projectScope`: the outbox kept to one project's entries. |
| `engine.ts` | no | `createSyncEngine`: link, check, runner. No runes. |
| `controller.svelte.ts` | no | `provideSync`, `useSync`: the engine on the real page, as runes. |

`engine.test.ts` runs the real store, editor, runner and transport against the fake site.

## When the runner runs

A current project, a live session, a link to an FPT project on the signed-in site, and a site
that passed the check (its resolution is in the cache). It stops when any of those goes, and when
the page is hidden. An expired session stops a drain as `unauthorized`; the session marks itself
expired, and the runner starts again on the next sign-in. Capture never calls here.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **The link is kept in `localStorage`, per project id** (`sg-onset:sync:link:<id>`), with the
   site. Not in the store's tables: no schema change, and a backup restored on another device
   links again. A link made on another site does not hold.
2. **A project that has synced cannot link to another FPT project.** Its records are in the first
   one. Unlinking stops sync; linking the same one again resumes.
3. **The runner drains the current project only.** The transport answers the linked FPT project's
   id for any project's create, so without the scope the sample project would land in it. Other
   projects' changes wait until they are current and linked. The status counts the current
   project's.
4. **Linking runs the check, which only reads.** Fields are created on **Set Up Fields** only,
   after a review: the site and Flow PT project, the fields by entity, the fields Flow PT adds,
   and that the schema change cannot be undone from the app. **Not Now** writes nothing.
5. **The project list** leaves out templates, the demo show and archived projects (corpus
   findings/018). One page of 500.
6. **Last sync** is when a drain last ended with nothing it could move (`idle` or `waiting`).

## Not tested without a real site

The answers are measured now (corpus findings/132–145, `$lib/fpt` README), but only against a
process, not this app: a real browser upload, the bearer renewal in a long session, what a
Manager or Vendor account gets, the fields Flow PT adds for our links, and `navigator.onLine` on
iPadOS. `docs/live-sync-test.md` is the checklist.

A push refused for want of rights (an Artist creating a take, findings/143) needs attention with
"This Flow PT account can't create Takes. Ask an Admin for the permission." and that kind of
change waits until the transport is made again (sign-in, link, project). There is no permission
check before sync: Kevin's call for v1.
