# sg-onset

`BRIEF.md` is the product context: what the app does, why, the decisions and the open questions.
Read it first. It is not committed yet.

## Rules

- Pure functions in their own modules, no I/O in them. Components only when needed. Pages and
  views as thin as possible, with as little logic as possible.
- Unit tests for every pure module, written first (TDD). Integration or E2E tests where a flow
  needs them.
- API behaviour comes from `~/dev/sg-groundtruth/corpus` (read `INDEX.md` first). Never guess. A
  gap is a probe in sg-groundtruth first: one issue, a PR to `dev`.
- FPT widgets are registry copies from `../sg-widgets`, the client is `sg-widgets-core` from npm.
  What they lack grows there, issue and PR there, never a private extension here. Generic UI is
  shadcn-svelte.
- The iOS look is the kit in `src/lib/components/ios/`, `src/lib/ios/` and `src/lib/pwa/`, from
  holosession. Spec: `docs/ios/plan.md`. Each folder's README lists its parts.
- Offline first: everything renders in the browser (`ssr = false`), the shell is cached by
  `src/service-worker.ts`.
- No LLM in the app. Deterministic.

## Copy

Kevin's voice, in the app and in the docs: short sentences, plain words, terse. No dashes, no
metaphors, no "not X, Y", no filler.

## Layout

- Pure modules each with its test beside it as `<module>.test.ts`.
- `src/lib/ios/`: the kit's pure modules and state. `src/lib/pwa/`: home-screen glue.

## Process

- Issue: one paragraph, edited in place when scope changes. No issue comments.
- Branch from `dev` (`feat/<issue>-slug` or `fix/slug`). PR onto `dev`, squash-merged.
- `main` is promoted by a PR from `dev`, merge commit, after Kevin QAs `dev`.
- Merging to `dev` or `main` needs Kevin's say in the session.
- No GitHub repo yet: local only.

## Commands

    pnpm install / pnpm dev / pnpm check / pnpm test / pnpm build
