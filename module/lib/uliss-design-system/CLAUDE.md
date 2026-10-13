# Design-system instructions

Read the repository `CLAUDE.md`, this module's `README.md`, and the consuming module guidance before editing the design
system.

## Invariants

- This directory is both npm package `@uliss/design-system` and Gradle module `:uliss-design-system`.
- React consumes TypeScript source directly through the package export. The Gradle jar packages built CSS and fonts for
  auth under `META-INF/resources/ds`.
- Keep CSS source split into the existing token files and imported through `src/styles.css`; do not introduce a second
  monolithic source of truth.
- Preserve relative font paths that work both from Vite and from `/ds/**` in the jar.
- Theme behavior is controlled by the documented `<html>` data attributes and CSS custom properties.
- Read a component's adjacent `<Component>.prompt.md` before using or changing it. Treat those files as behavioral
  design contracts, not auto-loaded agent instructions.

## Component rules

- Export public React components and types through `src/react/index.ts`.
- Keep component source and prompt documentation adjacent and update both when public behavior changes.
- Prefer shared tokens over one-off values. Preserve the intentionally square default geometry and explicitly documented
  circular exceptions.
- The Claude Design project pinned in `.design-sync/config.json` is a generated mirror of this package, never a source
  of truth. Older external Claude Design files are historical provenance; do not claim pixel parity against them.

## Claude Design sync

- `/design-sync` publishes this package (bundle, tokens, fonts, `.d.ts`, `.prompt.md`, preview cards) to Claude
  Design. Upload only when the user asks for a sync in that request.
- Re-sync after a merged change to the public surface: components, props, exports, tokens, fonts, or `.prompt.md`
  files. Web-only changes, tests, and internal refactors with no visible or API change do not need a sync.
- `.prompt.md` files ship verbatim to the design agent. Keep their examples compiling against the current props.
- Keep `.design-sync/previews/<Name>.tsx` in step with the API in the same change: add one for a new component,
  delete it for a removed one, and update stories when props or variants change.
- `.design-sync/preview-kit/Ground.tsx` and `.design-sync/conventions.md` mirror the body and focus rules of
  `module/web/src/app.css`; update them together.
- Read `.design-sync/NOTES.md` before a sync: run the converter scripts as bare commands from the repository root
  (sandbox exclusion) and run `.design-sync/build-dist.sh` first.

## Verification

- Use `npm run typecheck -w @uliss/design-system` for TypeScript changes.
- Use `npm run build -w @uliss/design-system` for CSS output.
- Use `./gradlew :uliss-design-system:jar` when resources or packaging change, and inspect the jar entries when path
  behavior is relevant.
- Also build the affected consumer (`@uliss/web` or `:auth`) when changing public components, tokens, exports, or
  packaged resources.
