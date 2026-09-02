# Design-system instructions

Read the repository `AGENTS.md`, this module's `README.md`, and the consuming module guidance before editing the design
system.

## Invariants

- This directory is both npm package `@uliss/design-system` and Gradle module `:uliss-design-system`.
- React consumes TypeScript source directly through the package export. The Gradle jar packages built CSS, fonts, and
  assets for auth under `META-INF/resources/ds`.
- Keep CSS source split into the existing token files and imported through `src/styles.css`; do not introduce a second
  monolithic source of truth.
- Preserve relative font/asset paths that work both from Vite and from `/ds/**` in the jar.
- Theme behavior is controlled by the documented `<html>` data attributes and CSS custom properties.
- Read a component's adjacent `<Component>.prompt.md` before using or changing it. Treat those files as behavioral
  design contracts, not auto-loaded agent instructions.

## Component rules

- Export public React components and types through `src/react/index.ts`.
- Keep component source and prompt documentation adjacent and update both when public behavior changes.
- Prefer shared tokens over one-off values. Preserve the intentionally square default geometry and explicitly documented
  circular exceptions.
- External Claude Design files are historical provenance unless they are attached or exposed through a verified tool. Do
  not claim pixel parity against an unavailable source.

## Verification

- Use `npm run typecheck -w @uliss/design-system` for TypeScript changes.
- Use `npm run build -w @uliss/design-system` for CSS output.
- Use `./gradlew :uliss-design-system:jar` when resources or packaging change, and inspect the jar entries when path
  behavior is relevant.
- Also build the affected consumer (`@uliss/web` or `:auth`) when changing public components, tokens, exports, or
  packaged resources.
