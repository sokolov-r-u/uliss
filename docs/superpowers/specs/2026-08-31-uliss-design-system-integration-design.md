# Design: Uliss Design System integration (refresh)

**Date:** 2026-08-31
**Status:** approved — decomposition + sub-project 1
**Source of truth:** Claude Design project `Uliss Design System`
(`f1d69f89-fcda-4e49-a0b2-d6ed9e9235d6`), pulled via the `DesignSync` tool.

---

## Goal

The Uliss visual language in Claude Design has changed fundamentally since the
partial port that currently lives in `module/lib/uliss-design-system` and half of
`module/web`. This program brings the codebase back in line with the current
design system: new tokens, new type stack, new theming model, the full component
set, and every product screen — server-rendered `auth` pages and the `web` SPA
alike.

## Why the design changed (old → new)

| Area | Old (in the repo today) | New (Claude Design) |
|---|---|---|
| Type | IM Fell English + Cormorant Garamond + JetBrains Mono | **Cinzel 600** (wordmark + counts) + **Source Serif 4** (everything else, chrome included) |
| Default accent | terracotta | **ochre** `#d99a4e → #f0c06a` |
| Grounds | cool navy "deepsea" | **Obsidian** — neutral black `#0a0a0a` |
| Tokens | 4 files, no themes | 7 files + `themes.css`; theme via `<html data-ground data-accent data-read>` |
| Components | 5 "banner-era" primitives in `src/react/` | 34 components under `components/<group>/` |
| Fonts | self-hosted woff2 (OFL) | Google Fonts CDN `@import` (flagged as debt in the DS) |
| Weight scale | raw `--weight-*` | weight ladder `--w-body/ui/emphasis/strong` (350/400/500/600) |

## Product model (from `Product Logic.dc.html`)

Uliss is a voice-first thinking journal. The user talks; Uliss transcribes,
threads the conversation and **writes the note itself**. Notes (`note` in lists /
chat, `star` inside the graph) gather into **Constellations** (a nestable tree),
and every note is a star in the **Sky** — one force-directed graph at three
distances (Skeleton · Focus · Full). Uliss acts on its own (links notes, proposes
splits/merges) and logs every act in **Updates**, where each is reversible.

Nav model, all breakpoints: left panel, five destinations in frequency order —
**Chats · Notes · Constellations · Sky · Updates** — plus search. No bottom tab
bar; on mobile the panel is a hamburger drawer.

Backend reality today: `note-service` is a scaffold (`/note/ask` + chat CRUD +
SSE). `user-service` drives onboarding. There is **no** backend for Notes CRUD,
Constellations, the Sky graph, or Updates.

---

## Closed decisions

- **Fonts self-hosted**, not CDN. Closes the DS's own `@font-debt` / Tech Debt
  F1–F2. Source Serif 4 ships as a **variable** woff2 (upright + italic, `wght`
  300–600, `opsz` 8–60) so the non-standard reading weight **350** renders
  exactly; Cinzel ships as a **static 600** woff2. Weight 350 stays as designed —
  not swapped for 300 (too thin on a black ground at 14.5px).
- **CSS token structure: flat.** Everything lives directly in `src/tokens/*.css`.
  The DS's `uliss-styles.css` "source of truth" file is **not** mirrored — its
  content is split across `colors.css` / `typography.css`. (Re-sync with Claude
  Design is manual and accepted as slightly harder.)
- **Comments compressed** to the project's terse config style: short notes on
  non-obvious tokens only, no audit-history banners.
- **Transition strategy: clean cut (A1).** Tokens are rewritten to the DS names
  exactly; removed aliases (`--font-mono`, `--font-serif`, `--weight-*`,
  `--border-strong`, `--gradient-wordmark`, `--glow-ochre`) are **not** shimmed.
  Consumers reference dead vars until their wave rebuilds them. All waves land on
  the `FE-design` branch; a half-migrated DS is never merged to `main`.
- **Backendless screens are static mock-ups** per the Claude Design kit
  (`ui_kits/app/*.jsx`), in the spirit of the existing `ui/TbdPage.tsx` — real
  page chrome, no fabricated data.
  - **Sky (#9): empty stub only** for now — the screen shell per mock-up, no
    force-directed renderer. The renderer is a later, separate task.
  - **Notes (#7): pure static** per mock-up — not wired to `note-service`.
- **Components ported `.jsx` → `.tsx`** into the design-system module, matching
  the existing `src/react/` convention (`tsc --noEmit` typecheck). The DS ships
  `.d.ts` + `.prompt.md` per component — those rules are authoritative.
- **Cyrillic deferred.** Product copy is English now (Russian later). Latin +
  Latin-ext subsets only. Cinzel has no Cyrillic glyphs at all — fine, the
  wordmark ("Uliss") and counts (digits) are Latin. Logged in `TECH_DEBT.md`.

---

## Decomposition

Each sub-project is its own spec + implementation plan + task file + PR.

| # | Sub-project | Backend | Size | Depends on |
|---|---|---|---|---|
| **1** | **DS: foundation** — 7 token files (ported 1:1 from Claude Design), self-hosted fonts, `styles.css`, theme attributes. Old `tokens/*` values removed. | — | M | — |
| **2** | **DS: components** — 34 `.tsx` under `src/react/components/<group>/`, barrel export, typecheck. `src/react` "banner-era" set (`DevRule` + old `Wordmark`/`Kicker`/`PostBadge`) retired. | — | L | 1 |
| **3** | **Auth Thymeleaf re-skin** — `login`/`register` to the Entry board (`data-surface="login"`, pinned obsidian + ochre, Cinzel wordmark). Markup + CSS only; no OAuth logic. | yes | S | 1, 2 |
| **4** | **Web: shell + navigation + theming** — `<html data-ground data-accent data-read>`; `AppShell`/`SideNav`/`TopBar`/drawer from `uliss-nav.jsx`; nav = Chats · Notes · Constellations · Sky · Updates + search; new routes as `TbdPage`. | yes | M | 1, 2 |
| **5** | **Chat** — `ChatListPage`/`ChatPage`/`Bubble`/`ChatDock`/composer/mic from `uliss-nav.jsx` (`ChatDetail`) + `uliss-record.jsx`. | yes | M | 1, 2, 4 |
| **6** | **Onboarding + Notice + empty states** — notice mechanism on DS `Notice`/`Dialog`/`ProgressDots`; onboarding steps; empty states for notes / sky / search. | yes | M | 1, 2, 4 |
| **7** | **Notes** — list + note surface + meta plate + context panel. Static per mock-up. | no (static) | L | 1, 2, 4 |
| **8** | **Constellations** — expand/collapse tree + right panel + delete-branch dialog. Static from `uliss-tags.jsx`. | no (static) | M | 1, 2, 4 |
| **9** | **Sky** — screen shell + empty state per mock-up. **No renderer.** | no (stub) | S | 1, 2, 4 |
| **10** | **Updates** — queue + log + 4 filters + Undo. Static per mock-up. | no (static) | M | 1, 2, 4 |
| **11** | **Settings ×5** — Root / Appearance / Sky / Account / Language. Appearance genuinely drives the theme attributes (persisted per device, `localStorage`). | partial | M | 1, 2, 4 |

**Order:** 1 → 2 → (3 ∥ 4) → 5 → 6 → 7…11.
**Branch:** waves stack on `FE-design`; `main` gets nothing until the DS module
and its consumers are internally consistent.

---

## Sub-project 1 — DS: foundation (detailed)

### Scope

Only `module/lib/uliss-design-system/src/` — CSS tokens + self-hosted font
binaries. **Out of scope:** components (`src/react/**` → wave 2), any
`web` / `auth` screen markup (waves 3–6).

### 1. Fonts → `src/fonts/`

| File | Kind |
|---|---|
| `source-serif-4.woff2` | variable, `wght` 300–600 + `opsz` 8–60, upright, latin + latin-ext |
| `source-serif-4-italic.woff2` | variable italic |
| `cinzel-600.woff2` | static 600, latin + latin-ext |

- **Acquisition:** Google Fonts `css2` API with a browser `User-Agent` returns
  `@font-face` blocks pointing at per-`unicode-range` pre-subset woff2 — download
  the latin + latin-ext files. Fallback: `google-webfonts-helper`
  (`gwfh.mranftl.com`) or GitHub upstreams (Adobe `source-serif`, Google Fonts
  `cinzel`). Verify actual file sizes during implementation; no local subsetting
  tool is available (`fonttools` absent).
- **Delete:** `im-fell-english-*`, `cormorant-garamond-*`, `jetbrains-mono-*`.
- **`OFL.txt`:** rewrite for the two new families (both OFL 1.1 — Source Serif 4
  © Adobe, Cinzel © Natanael Gama).

### 2. `src/tokens/typography.css`

- `@font-face` × 3 (relative `../fonts/*`, `font-display: swap`); the two Source
  Serif 4 faces declare `font-weight: 300 600` ranges; guidance comment for
  `font-optical-sizing: auto` on consumers.
- Families: `--font-display` (`'Cinzel', serif`), `--font-text`
  (`'Source Serif 4', serif`).
- Reading scale: `--read-size` 14.5px, `--read-leading` 1.51, `--read-weight`
  350, `--read-weight-bold` 500, `--read-fg: var(--cream)`.
- Weight ladder: `--w-body` 350, `--w-ui` 400, `--w-emphasis` 500, `--w-strong`
  600, `--w-wordmark: var(--w-strong)`.
- Type scale: `--text-2xs` 10.5 … `--text-2xl` 33 (7 steps).
- Tracking (6 role-named px/em pairs): `--tracking-nav` 1.5px, `--tracking-row`
  1.6px, `--tracking-label` 2.6px, `--tracking-meta` 3px, `--tracking-kicker`
  4px, `--tracking-wordmark` 0.03em.
- Leading: `--leading-title` 1.15, `--leading-normal` 1.4.

### 3. `src/tokens/colors.css`

Grounds (Obsidian: `--bg-deep` / `--bg` `#0a0a0a`, `--bg-surface` `#161616`,
`--bg-panel` `#0d0d0d`, `--bg-muted` `#1c1c1c`); brand (`--terracotta-deep`,
`--terracotta`, `--ochre`, `--ochre-bright`); text (`--cream` `#eae6df`,
`--cream-dim` `#a9a5a0`, `--text-muted` `#8b9098`, `--text-faint` `#6b7079`);
lines (`--line` cream 14%, `--line-strong` cream 30%, `--line-chip` `#3a3022`);
wordmark (`--wordmark-app: var(--ochre)`, `--wordmark-login` `#f2ece0`,
`--wordmark-fill: var(--wordmark-app)`); accent pair + `color-mix` washes
(`--accent-glow` / `-mid` / `-soft`, `--accent-edge` / `-soft`); depth
(`--glow-accent`, `--glow-accent-strong`, `--shadow-modal`); overlay (`--scrim`
from `color-mix(--bg-deep 62%)`, `--amb-wash`).

### 4. `src/tokens/spacing.css`

`--space-1..6` (4/8/12/16/24/32); layout constants `--gutter` 18, `--row-min` 34,
`--touch` 44, `--field-h` 48, `--dock-h` 46, `--cta-h` 50, `--bar-h` 46;
`--radius: 0`.

### 5. `src/tokens/themes.css` *(new)*

`[data-ground='obsidian'|'void']`, `[data-accent='ochre'|'terracotta'|'patina'|'bone']`
(each also repoints `--wordmark-fill`), `[data-read='compact'|'regular'|'large'|'larger']`,
`[data-surface='login']` (pins wordmark/headings to bone, opens `--line-strong`,
defines the sign-in CTA vars). Defaults (obsidian · ochre · regular) already live
in `colors.css` / `typography.css`, so an unattributed document renders correctly.

### 6. `src/tokens/motion.css` *(new)*

`--dur-hover` 0.15s, `--ease` ease, `--dur-notice` 0.5s, `--ease-notice`
cubic-bezier, `--pulse-period` 1.9s, `--twinkle-min` 4s / `--twinkle-max` 11s;
keyframes `uSkyTw`, `uNoticeCaret`, `uNoticeIn`, `uPending`, `uPendingHalo`;
classes `.u-pending` / `.u-pending-halo`; `@media (prefers-reduced-motion: reduce)`
disables both.

### 7. `src/tokens/sky.css` *(new)*

`--sky-scale-fine/regular/bold/beacon` (0.7/1/1.35/1.75); `--sky-bg: var(--bg-deep)`,
`--sky-glow-a` / `-b`, `--sky-nebula`, `--star-fill` `#ffffff`;
`--edge-structural: var(--line-strong)`, `--edge-secondary: var(--line)`,
`--node-you: var(--accent-2)`; `--tag-lightness` 0.62 / `-min` 0.34 / `-max` 0.86.

### 8. `src/tokens/textures.css`

Craquelure / grain / meander-h / meander-v data-URIs; `--tex-opacity` 0.5;
utility classes `.craquelure` (`mix-blend-mode: overlay`, opacity from
`--tex-opacity`), `.grain` (`soft-light`, `calc(--tex-opacity * 0.7)`),
`.meander-top/bottom/left/right`.

### 9. `src/styles.css`

`@import` all 7 token files, in order: `colors`, `typography`, `spacing`,
`themes`, `motion`, `sky`, `textures`.

### 10. Build / packaging

- `package.json` `exports` unchanged (`./styles.css`, `./tokens/*`, `./assets/*`).
- postcss glob `src/**/*.css` → `dist/` unchanged; `color-mix()` passes through
  autoprefixer untouched (acceptable — modern browsers only).
- Gradle `:uliss-design-system:jar` packs `dist/**` + `src/fonts/**` +
  `src/assets/**` into `META-INF/resources/ds/`; `auth` serves `/ds/**`. `@font-face`
  relative `../fonts/*` resolves identically in the jar (`/ds/tokens/` → `/ds/fonts/`)
  and in Vite.

### 11. Documentation

- `module/lib/uliss-design-system/CLAUDE.md` — rewrite the "Frontend / design
  system" font paragraph: two families, self-hosted, `<html>` theme attributes,
  the 7-file token layout.
- `docs/TECH_DEBT.md` — add: (a) Cyrillic subset for Source Serif 4 deferred;
  (b) `src/react` components still on the old DS until wave 2; (c) design-system
  card/specimen pages not ported.

### Verification

CSS-only module — no unit tests. Green:
`npm run build -w @uliss/design-system`,
`npm run typecheck -w @uliss/design-system`,
`./gradlew :uliss-design-system:jar`.
Plus a throwaway specimen HTML (loads `dist/styles.css`, sets the three theme
attributes, shows type + swatches) eyeballed in a browser — not committed.

### Risks

- **Font acquisition via proxy.** `fonts.googleapis.com` / `fonts.gstatic.com`
  confirmed reachable from the sandbox. If the browser-UA trick yields ttf not
  woff2, fall back to `google-webfonts-helper`.
- **Variable-font weight range syntax.** `@font-face { font-weight: 300 600 }`
  needs the woff2 to actually carry the `wght` axis; verify with the downloaded
  file before writing the face.
- **`auth` has no CSP today** — self-hosted `/ds/fonts/*` is same-origin and
  unproblematic; noted so a future CSP includes `font-src 'self'`.
