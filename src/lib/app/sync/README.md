# app/sync

Sync to Flow PT, wired into the app: the project link, the setup check, the runner, the status.
The outbox (`$lib/outbox`) and the transport (`$lib/fpt`) do the work; this holds them together.

## Modules

| module | pure | what it does |
|---|---|---|
| `status.ts` | yes | `syncStatus`: the state the shell shows, from account, link, setup, network, queue, and what waits for an entity the site lacks. |
| `link.ts` | yes | `ProjectLink`, its stored form, `linkOn` (same site only), `linkProblem`. |
| `links.ts` | port | `linkStore`: the links over a key-value port. |
| `report.ts` | yes | `setupView`: `checkSetup`'s report as the sheet shows it. |
| `review.ts` | yes | `setupReview`, `nextStep`: the review before Set Up Fields; `prototypeNote`. |
| `queue.ts` | yes | `pendingByKind`, `scopedUpdate`, `parentOf`, `conflictLines`. |
| `projects.ts` | yes | `PROJECT_FILTER`, `projectChoices`: the FPT projects a person picks from. |
| `errors.ts` | yes | `syncError`, `syncErrorText`. |
| `clock.ts` | yes | `toSecond`: `app.now()` stamps to the second. |
| `shots.ts` | yes | Which slates to bring in line, when, and what the sync sheet lists of their Set Shots. Nothing kept. |
| `notes.ts` | yes | Notes on Shots (#97): the setting per project, what the sheet shows, which Shots get a Note. |
| `referenceSlates.ts` | yes | The slates each set reference shows on, by Flow PT id, for its Slates field (#107). Nothing kept. |
| `waiting.ts` | yes | What waits on the device for what the site lacks: the set references, without Set Reference (#117); templates and reference kinds, without the Project fields (#110). |
| `shared.ts` | yes | The lists a show shares (#110): `mergeShared`, what a list read back from Flow PT does to the device's; `usedIds`; the sheet's kept list. |
| `changed.ts` | yes | The sheet's "Changed on another device" list (#110): what a merge changed of entries used here, until seen. |
| `scope.ts` | no | `projectScope`: the outbox kept to one project's entries. `withoutWaiting`: and without what waits. |
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
7. **Nothing about links is kept on the device** (Kevin, 2026-11-17, #102). Each sync reads Flow
   PT and sets what differs (lib/fpt README, Set Shots and Shot links). #96's list of codes
   waiting, codes several Shots have and unlinks owed (`sg-onset:sync:shots:<id>`), and the
   matched Set Shots this change first kept (`sg-onset:sync:setShots:<id>`), are no longer read:
   both keys are removed when the project loads.
8. **Every slate of the current project Flow PT holds is brought in line when a drain ends,** at
   most once a minute, at once on Sync Now: its Set Shots set to those of its codes, its Shots to
   those of its Set Shots. A slate with no codes is in it too, so a code taken off is unlinked even
   if the write at its push failed. A push links the slates whose codes it touched right after its
   batch.
9. **The sync sheet lists, by slate, the codes several Shots have** under "VFX shots to check",
   from what the last sync read, in memory. A row opens the slate. A code no Shot has yet is filed
   as a Set Shot, which is expected, and is not listed (Kevin, #102).
10. **The slate's VFX shots field offers the linked project's Shot codes** while one is typed, as
    chips (`slates/shotSuggest.ts`). Read with a link, a session and a network, every page, kept
    five minutes. Offline nothing is offered and the field is free text.
11. **A site without Set Shot syncs the rest** (Kevin, #117). The sync sheet's "Set Shots" section
    says an admin enables a custom entity named Set Shot and runs Set Up Fields, and counts the
    slates whose codes wait. After a setup check the runner starts again with a new transport, so
    an entity enabled since is synced at the next drain.
12. **Notes on Shots is a setting per project, kept on the device** (#97), `sg-onset:sync:notes:<id>`,
    beside the link. Off by default: some studios will not want an app writing Notes. It is a
    choice about what this project writes to its Flow PT project, a device may hold projects of
    two studios, and one device with it on is enough: the Note is built from what Flow PT holds,
    whatever device sent it. Not in the store's tables, so not in a backup, as the link is not. The
    sync sheet shows it under the Flow PT project, once linked.
13. **The Notes are written where the links are,** when a drain ends, after the slates are brought in
    line: at most once a minute, at once on Sync Now. The Shots are every Shot the project's slates
    reach through their Set Shots (lib/fpt README, Notes on Shots). A site without Set Shot writes
    none. A site without the Note fields writes none, and the sheet says an admin runs Set Up
    Fields; turning the setting on then runs the setup check again, which only reads.
14. **The Slates field of each set reference is set when a drain ends,** before the slates, so the
    Notes on Shots read it (lib/fpt README, "The slates of a set reference"): to the slates it
    shows on now, in `set` mode, where it differs. At most once a minute, at once on Sync Now, and
    at once when the device asks for other slates than the last time (a reference logged, a slate
    made or moved). That last ask is in memory only. Nothing is kept on the device; an earlier
    build's list, `sg-onset:sync:referenceSlates:<id>`, is removed when the project loads.
15. **A site without Set Reference syncs the rest** (Kevin, #117). A set reference is a record on the
    device, so it waits in the queue: the runner drains a port that leaves the references' entries
    out (`waiting.ts`, `scope.ts`). They stay as they are, never sent, never dropped, and need no
    person. The status names them, "All synced, 3 waiting", so nobody takes them for safe in Flow
    PT (Kevin, #117); while sync is stopped they count with the rest of the device's changes.
    **Waiting, by kind** lists them, and the sync sheet's **Set References** section says an admin
    enables a custom entity named Set Reference and runs Set Up Fields, and counts the references
    waiting. After a setup check the runner starts again: they go at the next drain, and their
    Slates are set when it ends. A Set Shot's links are no entry of the queue: the status does not
    count them, and the **Set Shots** section counts the slates whose codes wait (decision 11).
16. **The lists a show shares are read back when a drain ends** (#110): cameras, lenses, camera
    setups, lighting setups, templates and the kinds of set reference the project adds. At most once a minute, at
    once on Sync Now, after the slates' links. A new device starts with them at its first sync.
    Slates, takes and references are not read back: they stay with the device that made them
    (Kevin, 2026-11-17).
17. **The merge is `mergeShared`, table by table, inside one store transaction** (`reconcile`):
    matched by client UUID; a record made elsewhere is added; a field changed elsewhere is taken,
    unless it was edited here and the edit is not confirmed, in any state; a record removed elsewhere
    is removed here, unless something here uses it or an edit of it waits. Nothing taken in is
    queued or put on the undo stack.
18. **No drain runs while the lists are merged, and they are not read while a drain runs.** A
    change confirmed between the read and the merge would look like a change made elsewhere and be
    put back. A drain waits for a merge under way; a drain that ends while another runs skips the
    read, and the last one reads.
19. **A record removed elsewhere and kept here is sent back with its id** (Kevin, 2026-11-17): its
    server id goes, its unsent edits fold into a create of the record as it is, and every device
    gets it again at its next sync. Without it, a take or camera setup that links it could not
    sync. It is listed in the sync sheet under "Kept on this device" for the session, with a row
    that opens it. A record whose edit is under way is kept and sent back at a later sync.
20. **"Used" is what this device holds:** a camera or a lens in a take or a camera setup, a camera
    setup a take is on or this device shoots with, a lighting setup in a slate, a template a slate
    or take was made from, a kind a reference holds by name. What another device's takes use is not
    known here.
21. **A record never on Flow PT and with nothing queued is sent.** That is a template or kind kept
    on the device before #110. Two devices that each made one send both: the list keeps both.
22. **A pulled change to an entry in use changes the entry only, and is listed until seen**
    (Kevin, 2026-11-17). A take keeps the lens it has, and its own focal length; a slate keeps the
    values its template gave it. The sync sheet's "Changed on another device" list names the entry
    and the fields taken (`changed.ts`), newest first, one row an entry; opening the row marks it
    seen. Nothing shows on the take screen. The list is kept on the device per project,
    `sg-onset:sync:changed:<id>`, so a reload keeps what was not seen. An entry removed since leaves
    it. A new entry, or a change of one not used here, is not listed.
23. **On a site without the Project fields, templates and kinds wait** (#117's rule): the runner
    does not see their changes (`waiting.ts`), the status counts them as waiting, and the sync sheet
    says an admin runs Set Up Fields, then Check Setup on each device. Cameras, lenses, camera setups
    and lighting setups are shared already: they are entities every site has.
24. **Every device sees every camera setup; each chooses the ones it shoots with** (Kevin,
    2026-11-17). The choice is kept on the device, per project, never synced (`lib/gear/shooting.ts`,
    `localStorage` `sg-onset.shooting`): the setups it does not shoot with. By default a device shoots
    with the setups made on it; one read back from another device starts unchosen, marked before it
    is put, so the take screen never shows it in between. The take screen's columns and Start use
    only the chosen setups (`take/groups.ts`); a take of the slate on another setup keeps its column.
    Gear shows a check per setup. Wrap, the exports and Flow PT keep every take.

## Not tested without a real site

The answers are measured now (corpus findings/132–145, `$lib/fpt` README), but only against a
process, not this app: a real browser upload, the bearer renewal in a long session, what a
Manager or Vendor account gets, the fields Flow PT adds for our links, and `navigator.onLine` on
iPadOS. `docs/live-sync-test.md` is the checklist.

A push refused for want of rights (an Artist creating a take, findings/143) needs attention with
"This Flow PT account can't create Takes. Ask an Admin for the permission." and that kind of
change waits until the transport is made again (sign-in, link, project). There is no permission
check before sync: Kevin's call for v1.
