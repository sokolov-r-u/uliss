# Web application instructions

Read the repository `CLAUDE.md`, this module's `README.md`, and the relevant backend/design-system guidance before
editing the SPA.

## Invariants

- Browser calls use relative same-origin URLs. Do not expose auth or service addresses through `VITE_*` variables.
- Protected requests go through `authFetch`; do not bypass its bearer-token and refresh handling.
- Access and refresh tokens remain in `sessionStorage` until an explicitly scoped BFF change is approved.
- Native `EventSource` is not suitable for authenticated streams. Keep streaming on `authFetch` plus the reusable
  `ReadableStream` SSE parser.
- After chat streaming ends or fails, re-fetch server history and replace optimistic state with persisted truth.
- Abort an in-flight chat stream when its owning screen unmounts.
- Mount onboarding once in `AppShell`, process server-provided steps in order, and respect the API's blocking flag.
  Preserve a usable skip action for optional profile completion.
- Empty product areas remain honest empty states; do not fabricate backend data from design mockups.

## UI and design-system rules

- Reuse `@uliss/design-system` components and tokens. Read the component's adjacent `.prompt.md` before use or
  modification.
- The Claude Design project pinned in `.design-sync/config.json` mirrors the design system and is downstream of code.
  Screens designed there are proposals: build them from the real kit components, and add a missing component to the
  design system (with its `.prompt.md` and sync preview) before using it here.
- The original Claude Design project "Uliss Design System" (`f1d69f89-fcda-4e49-a0b2-d6ed9e9235d6`) holds the `PROT *`
  prototypes and screen templates for features not yet built. When implementing such a feature, read its PROT file
  (read-only, `DesignSync get_file`) as the design spec; ask the user when it conflicts with the current kit.
- Web-only changes (screens, routing, layout glue) do not require a design sync; see the design-system `CLAUDE.md`.
- Keep the authenticated application full-bleed and responsive; mockup artboards are not runtime layout constraints.
- A modal (`Notice`, `Dialog`, drawers over the screen) keeps its size while its state changes: validation errors,
  hints, busy or recording states, enabled/disabled actions. Only opening a different step of a flow may change it.
  - Build the modal from fixed blocks (title, body text, fields, hint line, actions). Every text of one kind uses the
    same block in every state: the description, "Starting…" and an error all go into the body block.
  - A block is sized for its longest variant. When variants differ, bring them to a common size: shorten the longer
    text, extend the shorter one, or reserve the empty space. If a text does not fit its block, change the text or
    the block, never let the modal grow or shrink.
  - Actions may disappear, but their place stays: the modal never collapses because a button is gone.
  - When a modal has such states, a Playwright test compares its bounding box before and after each change (jsdom has
    no layout, so Vitest cannot check it).
- Preserve a CSS-driven desktop/mobile breakpoint. Do not add JavaScript `matchMedia` logic without a functional need.
- UI source uses 4-space indentation after formatting. Re-read a file if an external formatter changes it during
  editing.

## Testing workflow

- No TDD here: the web tests are too slow for red–green cycles. Implement the change and check it with `typecheck`,
  then deploy it (`./gradlew buildAllImages`, `docker compose -f infra/docker-compose.yml --profile full up -d`) for
  the user's manual UI check.
- After the user confirms the result in the UI, write the Vitest and Playwright tests for the changed behavior and run
  `test` and `build`; then run the code review and fix its confirmed findings, and only after that the Playwright
  specs of the touched screens and any full visual run (they take minutes in Docker); commit the tests with the code
  (or as a follow-up commit of the same task). The full visual suite runs in CI on every pull request (`visual-checks` in
  `.github/workflows/pr-checks.yml`); run it locally only when asked or in an epic's final task.
- Inside an epic, a Playwright/visual test that fails because the task changes a screen that a later task of the same
  epic changes again may be skipped instead of updated:
  `test.skip(true, 'epic <epic-name>: re-enable in the final task')`. A screen changed only by the current task gets
  its tests and screenshots updated in that task. List every skipped test in the epic file with the task that skipped
  it. The epic's final task re-enables them all (no marker of the epic is left in `visual/tests`), updates screenshots
  with the user's approval, adds the deferred Playwright tests, and runs the full visual suite.

## Verification

- Use `npm run typecheck -w @uliss/web` for TypeScript changes.
- Use `npm run build -w @uliss/web` for final module verification.
- Also verify the design-system package when changing shared component usage or exports.
- Do not run the Vite dev/preview server without explicit permission.
- When a frontend visual/snapshot test fails, inspect the expected, actual, and diff artifacts and identify the
  affected source and snapshot files. Tell the user which screens changed and what to review; wait for the user's
  explicit approval before changing expected screenshots. After approval, update only the approved failing titles with
  `visual:update -- --grep <title>`, rerun those exact titles with `visual:test -- --grep <title>`, then run the
  complete visual suite. Never change component geometry solely to match an outdated snapshot.
