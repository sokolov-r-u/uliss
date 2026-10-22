# design-sync notes — @uliss/design-system

- The package ships TS source only (no JS dist, no `.d.ts`). `.design-sync/build-dist.sh` (`cfg.buildCmd`) builds a
  publish-like copy under `.design-sync/.cache/nm/@uliss/design-system` (esbuild ESM + tsc declarations + concatenated
  autoprefixed token CSS + fonts). Always run it before the converter and pass `--node-modules .design-sync/.cache/nm`.
- Per-component docs are the adjacent `<Name>.prompt.md` files; the build script copies them to
  `component-docs/<Name>.md`
  (`cfg.docsDir`), because the converter only matches `<Name>.md`.
- `OptionList` is exported from `forms/OptionCard.tsx`; pinned via `componentSrcMap` and `docsMap` (OptionCard doc).
- npm's default cache (`~/.npm`) is not writable from the Claude sandbox: install `.ds-sync` deps with
  `--cache "$TMPDIR/npm-cache"`.
- Headless Chromium cannot start inside the Claude macOS sandbox (`bootstrap_check_in ... MachPortRendezvousServer:
  Permission denied`). Validate/capture/resync are excluded via `sandbox.excludedCommands` in
  `.claude/settings.local.json`
  (user-owned). The exclusion only matches a bare command from the repo root — no `cd ... &&`, no pipes.
- `.ds-sync` installs the repo's `@playwright/test` version (`module/web/package.json`), so its Chromium build is the
  one already cached in `~/Library/Caches/ms-playwright`.
- The DS is dark-only and assumes the host body from `module/web/src/app.css` (`--bg` ground, `--cream` text,
  `--font-text`, token focus ring). Preview cards hard-code `body{background:#fff}`, so every authored preview wraps its
  cells in `.design-sync/preview-kit/Ground.tsx`. The conventions header tells the design agent to set the same body.
- `Dialog` and `ItemMenu` render fixed overlays: `cardMode: single` with a viewport. Fixed-width phone-sized previews
  overflow the multi-column grid, so most components use `cardMode: column`.
- The converter drops props inherited from `@types/react` (onClick, disabled, aria-*) from every `.d.ts`; the
  conventions header lists which components are native buttons/inputs instead.
- Validate's `[GRID_OVERFLOW]` did not flag every horizontally cropped grid card; check the contact sheets by eye.

## Known render warns

- None at the end of the 2026-10-13 sync.

## Re-sync risks

- `build-dist.sh` concatenates token CSS in `src/styles.css` import order; a new token file or a changed `@import`
  syntax there needs the sed pattern to keep matching (check `css/uliss.css` size after build).
- `Ground.tsx` mirrors `app.css` body/focus rules by hand; if the app base changes, update it and the conventions
  header together. Edits to `Ground.tsx` do not re-key grades — recapture affected components deliberately.
- Constellation previews use hand-picked `oklch(0.62 0.11 <hue>)` colours, not the app's colour function.
- Converter deps in `.ds-sync/` were installed from the npm registry (playwright pinned to the repo's `@playwright/test` version).
