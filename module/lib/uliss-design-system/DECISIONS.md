# Architecture decisions: design system

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-21 — One focus trap for overlays; contrast-safe faint text and field borders

- **Context:** Dialog and the web Notice overlay each trapped focus their own way, re-ran on every new callback
  (focus jumped on a parent re-render) and closed together with an open Select on one Escape. `--text-faint` was
  ~4.0:1 and `--line-strong` ~2.1:1 on panels; inline `outline: none` hid the focus ring on several fields.
- **Decision:** `useFocusTrap` (exported) owns initial focus, Tab wrapping, Escape and focus restore; callbacks go
  through a ref, and an Escape already handled (`defaultPrevented`) is ignored. Radio groups keep one tab stop even
  when nothing is selected, and arrow keys skip disabled options. `--text-faint` becomes `#7d828b` (≥4.5:1) and
  `--line-strong` 0.42 alpha (≥3:1); no component sets an inline outline on a focusable field.
- **Consequences:** faint text and strong lines look brighter. The public surface changed (hook export, Swatch
  `tabIndex`, ListRow `dots` default, tokens): a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 19.

## 2026-10-22 — TextField takes a soft limit and a trailing control

- **Context:** a summary note's name may be dictated, so it can arrive over 50 characters at once; cutting it would
  lose words, and the field needs a microphone next to the text. TextField only capped input with `maxLength`, had no
  error look by design, and no slot.
- **Decision:** an optional `limit` replaces the cap with a soft limit: input is never cut, the counter reads
  `N/limit` (code points of the trimmed value, whitespace runs as one, as the note-service title rule counts), and
  past the limit the edge and counter use `--terracotta` (the system has no red; terracotta already marks destructive
  and error text) with `aria-invalid`. An optional `trailing` slot puts one control inside the field. Without `limit`
  the `maxLength` behavior is unchanged.
- **Consequences:** public props changed; a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-22-summary-place-title.md`, block 4.

## 2026-10-22 — The place picker searches in its tree and lists notes as nodes

- **Context:** search swapped the tree for flat hits, notes came from an async host search under the constellations,
  and the list grew up to 300px. Users lost where a hit lives and could not walk notes.
- **Decision:** the list shows five rows and scrolls. Search keeps the tree: it marks the rows whose own name matches,
  unfolds the branches to them while it lasts, and steps through them with a counter, ↑/↓ and Enter/Shift+Enter; the
  current match is the selection. `notes.search` is replaced by `notes.items` (a flat list with parent note and
  constellations): a note sits in each of its constellations, sub-notes under their parent, the rest in a last
  "Without constellation" branch; `exclude` also hides a note with its sub-notes. The search field drops the global
  focus ring (replaces, for this field only, the "no inline outline" rule of 2026-10-21): its bottom edge and icon
  brighten on focus.
- **Consequences:** hosts load every candidate note up front (the web reads them from `GET /sky`). Public props
  changed; a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-22-picker-tree-notes.md`, block 1.

## 2026-10-22 — A collapsed place field for forms

- **Context:** the Summarize dialog held the whole picker under the name field, so the dialog grew while the tree
  loaded and unfolded.
- **Decision:** `PlaceField` shows the chosen path (or a placeholder) as one 48px line; a click unfolds the
  `ConstellationPicker` absolutely positioned under it. The picker's confirm button picks and calls `close`, which
  collapses the line and returns the focus; Escape does the same; a click outside only collapses it.
- **Consequences:** a new public component; a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-22-picker-tree-notes.md`, block 2.

## 2026-10-22 — Notice no longer clips; PlaceField opens upwards when short of room

- **Context:** in the Summarize dialog the place dropdown (about 340px) hangs below the card; the card clipped it
  (`overflow: hidden`), and on a laptop-height window it ran off the bottom of the screen.
- **Decision:** the Notice card drops `overflow: hidden` (its frame and ticks sit inside anyway). `PlaceField` measures
  the room under its line when it opens and opens upwards when the room below is short of the picker and there is more
  above.
- **Consequences:** content wider or taller than the card is no longer cut; hosts keep it inside. Amends the
  2026-10-22 PlaceField entry.
- **Source:** task `docs/tasks/2026-10-22-picker-tree-notes.md`, block 3.

## 2026-10-22 — PlaceField opens a sheet instead of a dropdown

- **Context:** the user's UI check: the dropdown hung past the Summarize card and looked out of place; the user asked
  for a much larger surface, the whole screen on a phone.
- **Decision:** `PlaceField` opens the picker in a modal sheet (portal over a scrim, own focus trap): 640px wide and up
  to 80% of the window high on a desktop, full screen below 768px. The picker gets `fill` and its tree takes the
  sheet's height; inline pickers keep five rows. Replaces the dropdown of "A collapsed place field for forms" and the
  whole entry "Notice no longer clips; PlaceField opens upwards when short of room": Notice clips again, there is no
  upward opening.
- **Consequences:** public props changed (`fill`); a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-22-picker-tree-notes.md`, manual check.

## 2026-10-22 — Choosing a place is a step of the same Notice

- **Context:** the user's UI check: a separate sheet over the Summarize dialog looked like a jump between two windows
  of different sizes and styles.
- **Decision:** `Notice` takes `step`: a second step drawn in the same card over the first, which stays hidden and
  inert to hold the size; the corner button becomes Back and Escape steps back. `PlaceField` is only the line: it
  asks the host to open the picker (`onOpen`, `open`) and takes the focus back when the step closes. `useFocusTrap`
  skips inert content. Replaces the sheet of "PlaceField opens a sheet instead of a dropdown"; `fill` stays and now
  fills the step.
- **Consequences:** `PlaceField` props changed (no `children`), `Notice` gained `step`; a Claude Design sync is due
  after merge.
- **Source:** task `docs/tasks/2026-10-22-picker-tree-notes.md`, manual check 2.
