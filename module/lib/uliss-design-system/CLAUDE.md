# CLAUDE.md — `:uliss-design-system`

Guide for `module/lib/uliss-design-system` (`@uliss/design-system`). Cross-cutting rules (workflow,
conventions, closed decisions) are in the root `CLAUDE.md` — read that first. Usage in
`auth`'s Thymeleaf pages — `module/auth/CLAUDE.md` («Auth UI» section). Usage in the SPA —
`module/web/CLAUDE.md`.

## Frontend / design system

`uliss-design-system` serves two worlds from one source `src/` (one source, two consumers):

- **npm package `@uliss/design-system`** — member of the npm workspace (root `package.json`,
  `workspaces: ["module/lib/uliss-design-system", "module/web"]`). React/Vite app
  (`module/web`): imports `@uliss/design-system/styles.css` and `.tsx` components via a
  workspace symlink. Components are **not built** — `exports."."` points directly at the source
  `./src/react/index.ts` (transpiled by Vite). `npm run build` = postcss with **per-file autoprefixer**
  into `dist/` (structure preserved, no inlining of `@import`).
- **Gradle module `:uliss-design-system`** (`build.gradle.kts`: `java-library` + the
  `com.github.node-gradle.node` plugin, alias `libs.plugins.node`) runs the npm build via Gradle and
  packs `dist/**` + `src/fonts/**` + `src/assets/**` into the jar under `META-INF/resources/ds/`.
  `auth` depends on it via a plain `implementation(project(":uliss-design-system"))` →
  Spring Boot serves `/ds/**` from the classpath jar automatically (a webjar-like pattern, no
  copy tasks). CSS is loaded as `/ds/styles.css` (it `@import`s tokens — it's not a flat
  bundle), fonts as `/ds/fonts/*`, assets as `/ds/assets/*`. `@font-face` in `tokens/typography.css` references
  `../fonts/*.woff2` —
  the relative path resolves the same way in the jar (`/ds/tokens/` → `/ds/fonts/`) and in Vite.
- `node { download = false }` — Gradle uses the system Node/npm; set to `true` for CI without Node.

### Tokens (`src/tokens/*.css`)

Seven flat files, all `@import`ed by `src/styles.css` in order: `colors`, `typography`,
`spacing`, `themes`, `motion`, `sky`, `textures`. There is no `uliss-styles.css` "source of
truth" file — Claude Design has one, this port splits it into `colors.css` + `typography.css`.
`--amb-wash` / `--scrim` reference `--sky-glow-b` / `--bg-deep` across files — CSS custom
properties resolve at use-time, so import order is not load-bearing.

Theming: three attributes on `<html>` — `data-ground` (`obsidian` | `void`), `data-accent`
(`ochre` | `terracotta` | `patina` | `bone`), `data-read` (`compact` | `regular` | `large` |
`larger`). Defaults (obsidian · ochre · regular) live in `colors.css` / `typography.css`, so an
unattributed document renders correctly. Sign-in additionally sets `data-surface="login"`.

### Fonts (`src/fonts/`, OFL 1.1 — see `src/fonts/OFL.txt`)

Two families, self-hosted, Latin + Cyrillic subsets (Google Fonts `css2` output, `@font-face`
with `unicode-range` so the browser fetches only what it needs):

- **Cinzel** 600, static, Latin only (no Cyrillic glyphs) — wordmark + counts (`--font-display`).
- **Source Serif 4**, the **variable** font (weight axis) — everything else, chrome included
  (`--font-text`). `font-weight: 350` (the reading weight, `--w-body`) is exact because it is a
  real axis position, not a static instance.

Adding/replacing a `.woff2` needs network access to `fonts.gstatic.com`. `@font-face` uses
relative `../fonts/*` — resolves identically in the auth jar (`/ds/tokens/` → `/ds/fonts/`) and
in Vite.

```bash
npm install                                # from repo root — sets up the workspace
npm run build -w @uliss/design-system      # postcss autoprefixer -> dist/** (multi-file CSS)
npm run typecheck -w @uliss/design-system  # tsc --noEmit over .tsx
./gradlew :uliss-design-system:jar         # transitively runs npm + builds the jar (META-INF/resources/ds/**)
```
