# send

"Send set data to artists" (#106): the page Flow PT's Action Menu Item opens after wrap, on a
desktop with nothing on it. Flow PT posts to `/action/send-set-data`; the route answers 303 to
`/send-set-data` with the site, the project, the entity type and the selected ids. Signed in to
that site, the page reads what Flow PT holds, says what Send will do, and runs only on the tap.
The Flow PT side, the rules and the corpus entries are in the fpt README, "Send set data to
artists"; Set Up Fields makes the item (fpt `actionMenu.ts`).

## Modules

| module | pure | what it does |
|---|---|---|
| `request.ts` | yes | The form Flow PT posts, read and checked (`readActionForm`); the page address and its reading (`pagePath`, `problemPath`, `readPage`). |
| `flow.ts` | yes | Whether the person signs in first (`sessionNeed`), what a failure asks of them (`failureOf`). |
| `text.ts` | yes | The words: the summary before Send, a line per Shot after, the problems. |
| `sendDriver.svelte.ts` | no | The steps as the page drives them: read, preview, send. Nothing is written before `send()`. |

The route is `$lib/server/action-route.ts`, the page `src/routes/send-set-data/+page.svelte`, the
words the `send` area of the catalogue.

## Decided

- Kevin, 2026-11-17: build it; without it the after-wrap links and Notes do not happen.
- A request from another site never writes on its own: the page shows what it will do and a Send
  button. No signature was measured on the request.
- Running the action is the request for the Notes: they are written whatever a device's Notes on
  Shots setting.
- Only the selected rows: `ids` is every row of the Flow PT page.
