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
- `.ds-sync` pins `playwright` to the repo's `@playwright/test` version (`module/web/package.json`), so its Chromium
  build is the one cached in `~/Library/Caches/ms-playwright`; reinstall `.ds-sync` before a sync when that version
  changed.
- The DS is dark-only and assumes the host body from `module/web/src/app.css` (`--bg` ground, `--cream` text,
  `--font-text`, token focus ring). Preview cards hard-code `body{background:#fff}`, so every authored preview wraps its
  cells in `.design-sync/preview-kit/Ground.tsx`. The conventions header tells the design agent to set the same body.
- `Dialog` and `ItemMenu` render fixed overlays: `cardMode: single` with a viewport. Fixed-width phone-sized previews
  overflow the multi-column grid, so most components use `cardMode: column`.
- The converter drops props inherited from `@types/react` (onClick, disabled, aria-*) from every `.d.ts`; the
  conventions header lists which components are native buttons/inputs instead.
- Validate's `[GRID_OVERFLOW]` did not flag every horizontally cropped grid card; check the contact sheets by eye.
  It missed `ConstellationColorEditor`/`ConstellationPicker` again on 2026-10-22: give every new component
  `cardMode: column` up front unless it is an overlay (`single`).
- `npx playwright install` (run from `.ds-sync`) deletes cached browser builds no installed Playwright pins; after a
  version bump only the new Chromium remains in `~/Library/Caches/ms-playwright`.

## Publishing to the Design System artifact (since 2026-11-17)

- The mirror is the artifact https://claude.ai/artifact/FRbUk8RgfNdLPZ3Dr2E1Sy (`74cf0a2d-1535-4a7a-bfaa-5569e498029a`
  is the same artifact). `/design-sync` 2.1.325 targets only claude.ai/design projects (`projectId`); the old project
  answers `get_project` with `moveState: "moved"` and refuses uploads. There is no artifact key in `config.json`.
- Sync: `build-dist.sh`, then the converter, validate and capture as above (no `--remote`: there is no project anchor),
  then `node .design-sync/to-artifact.mjs --bundle ./ds-bundle --tokens <tokens.json> --out .design-sync/.cache/artifact`.
  `<tokens.json>` is the artifact's own `project/tokens.json` (Artifact `read` by path); the adapter compiles
  `tokens.css` from it, because a page in `"editing": "code"` never writes `tokens.css`.
- Publish with the Artifact tool: `url` the artifact, `root` `.design-sync/.cache/artifact`, `file_path` the index
  `project/design-system.json` (read it again right before and keep its keys), `files` every other `project/` path.
  The index goes last; it keeps `"editing": "code"` and the two React 19 `libraries` entries.
- The type serves only web types: a `.ts` file needs `{"from": …, "contentType": "text/plain"}`. The adapter therefore
  ships only `components/index.d.ts` (the page reads props there), not per-component `.d.ts`.
- The type loads React 18 from jsDelivr unless `components/lib/` carries a runtime: the converter's `_vendor/react.js`
  (React 19, also defines `ReactDOM`) goes there, listed in the index `libraries` with `global` and `file`.
- `bundle.css` = the package's `@font-face` (urls repointed at `../fonts/`) + `_ds_bundle.css` (all CSS variables).
  It loads after `tokens.css`, so previews always render the package's own values; the page's colour-theme switch
  does not restyle them.
- Providers get no card (`LocaleProvider` stays in the bundle, not in the header's component list).
- The Artifact tool warns when the page saved `README.md` or the index after your read: read both right before the
  publish, not at the start of the run.
- The artifact frame blocks `fetch` to jsDelivr: the adapter ships the app's own `emoji-picker-element-data`
  (`node_modules`, same 1.8.0 the web app pins) at `project/data/…/data.json` and rewrites the EmojiPicker/IconPicker
  previews to `../../data/…` (a relative fetch of the artifact's own files works).
- The artifact's preview column is about 600px wide: keep a preview's `Ground` width at or under ~600px or let it wrap
  (`PosterFrame` States went from 6 columns at 760px to 3 at 480px). PosterCropper (680px) still fits.
- The page lazy-mounts cards as they scroll into view. A card that positions itself from `window.innerWidth` at mount
  (ItemMenu) must wait for a sized window; the ItemMenu preview remounts the menu on resize.
- Carried-forward grades can hide a regression from another component: the ItemMenu preview had shown no menu since
  ListRow started rendering its dots only with `onMenu`/`dots` (the preview now passes `dots`). Look at the artifact
  page, not only at the sheets of changed components.
- The PosterCropper card zooms on the wheel: scroll the artifact page with the pointer over the name column.
- The artifact page needs a claude.ai sign-in in the browser pane; local file previews of the cards render only as
  static snapshots there (relative scripts do not load).

## Known render warns

- None at the end of the 2026-11-17 sync (artifact page checked by eye, all 48 cards).

## Re-sync risks

- `build-dist.sh` concatenates token CSS in `src/styles.css` import order; a new token file or a changed `@import`
  syntax there needs the sed pattern to keep matching (check `css/uliss.css` size after build).
- `Ground.tsx` mirrors `app.css` body/focus rules by hand; if the app base changes, update it and the conventions
  header together. Edits to `Ground.tsx` do not re-key grades — recapture affected components deliberately.
- `EmojiPicker`/`IconPicker` previews load `emoji-picker-element-data@1.8.0` from jsDelivr at render time (the app
  serves it itself); an offline or blocked CDN leaves the picker grid empty. Keep the version in step with the app's.
- Constellation previews use hand-picked `oklch(0.62 0.11 <hue>)` colours, not the app's colour function.
- Converter deps in `.ds-sync/` were installed from the npm registry (playwright pinned to the repo's `@playwright/test` version).
