# Web application instructions

Read the repository `AGENTS.md`, this module's `README.md`, and the relevant backend/design-system guidance before
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
- Treat external Claude Design references as historical provenance unless an accessible reference is supplied. Do not
  assume `DesignSync` exists.
- Keep the authenticated application full-bleed and responsive; mockup artboards are not runtime layout constraints.
- Preserve a CSS-driven desktop/mobile breakpoint. Do not add JavaScript `matchMedia` logic without a functional need.
- UI source uses 4-space indentation after formatting. Re-read a file if an external formatter changes it during
  editing.

## Verification

- Use `npm run typecheck -w @uliss/web` for TypeScript changes.
- Use `npm run build -w @uliss/web` for final module verification.
- Also verify the design-system package when changing shared component usage or exports.
- Do not run the Vite dev/preview server without explicit permission.

