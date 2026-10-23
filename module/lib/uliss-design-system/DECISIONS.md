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

## 2026-10-23 — Note emoji through emoji-picker-element, shown by NoteTitle

- **Decision:** `EmojiPicker` wraps `emoji-picker-element` (exact version, lazy-loaded, themed through its CSS
  variables) and takes the data URL from the consumer, which serves `emoji-picker-element-data` itself. `IconPicker`
  is the 48px square beside a name field: on its own it opens the picker under itself (Escape, a click outside or a
  second click close it, its Escape is marked handled); in a `Notice` the host shows `EmojiPicker` as the notice's
  `step`, as with `PlaceField`, so the card keeps its size and the dialog's focus trap holds. Favorites stay in the
  library's IndexedDB: a browser without any gets a 20-emoji starter set once at count 1, and every pick through
  `EmojiPicker` counts once more than the library does, so the user's picks outrank the starters. `NoteTitle` /
  `noteTitleText` render "emoji, space, name"; in lists (`slot`, `ListRow.icon`, the picker's note rows) a note without
  an emoji keeps an empty slot of the same width.
- **Consequences:** the package gains its first runtime dependency; public props changed (`ListRow.icon`,
  `ConstellationPickerNoteItem.icon`) and three components were added; a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, block 3.

## 2026-10-23 — The emoji picker is one dropdown everywhere, favorites on top

- **Context:** the user's UI check: as a `Notice` step the picker was squeezed to the card's height, its favorites
  row was cut off, and it looked unlike the dropdown of the note edit form; the library draws favorites at its foot.
- **Decision:** `IconPicker` always opens its own dropdown, portalled into the nearest `[data-popover-root]`
  (`POPOVER_ROOT_ATTRIBUTE`) or the page, fixed under the square (above it when short of room, kept in the window).
  A dialog overlay marks its content as the root, so the dropdown stays in the focus trap and the card keeps its
  size. The hosted mode (`open`/`onOpen`) and `EmojiPicker.fill` are gone. `EmojiPicker` appends a style to the
  library's shadow root that puts the favorites row under the categories, above the grid. Replaces the `Notice` step
  of "Note emoji through emoji-picker-element, shown by NoteTitle".
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, manual check 1.

## 2026-10-23 — Three rows of our own favorites over a three-row grid

- **Context:** the user's UI check 2: the dropdown ran past the bottom of the window, and the user asked for more
  favorites and a shorter grid. The library shows exactly one row of favorites (as many as its columns) and has no
  setting for more.
- **Decision:** `EmojiPicker` hides the library's favorites row and draws its own: up to 21 (three rows of seven) from
  the library's store (`getTopFavoriteEmoji`), above the search, in the preferred skin tone (following
  `skin-tone-change`); a pick there counts twice, as a pick in the grid does. The library's grid is three rows high
  and scrolls; sizes are in px, so the app's reading scale does not change them. `IconPicker` keeps the panel inside
  the window, over the square when neither side has room. Replaces the favorites placement of "The emoji picker is
  one dropdown everywhere, favorites on top".
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, manual check 2.

## 2026-10-23 — In a dialog the emoji picker covers the card

- **Context:** the user's UI check 3: the dropdown hanging over part of the Summarize card looked crooked; the user
  asked for one card to stand in for the other.
- **Decision:** `IconPicker` takes `cover`: the picker lies over the nearest `[data-popover-root]` (the dialog's card)
  in its place and size, titled "Choose an icon" with a close button; `EmojiPicker` regains `fill` (three rows of
  favorites, the grid takes the rest). Pages keep the dropdown. "Remove the icon" takes room only while it is shown.
  Refines "The emoji picker is one dropdown everywhere, favorites on top" for dialogs.
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, manual check 3.

## 2026-10-23 — One emoji panel for the dropdown and the cover

- **Context:** the user's UI check 4: in the note edit form the library's grid ran past the dropdown (a column flex
  item's automatic minimum height is its content), and the user asked for the same picker as in the dialog.
- **Decision:** `IconPicker` renders one panel in both modes — title and close button, `EmojiPicker` with `fill` —
  that differs only in place and size: over the card with `cover`, 360px wide at a fixed height under the square
  otherwise. The library's host has `min-height` set in both `EmojiPicker` layouts. Refines "In a dialog the emoji
  picker covers the card".
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, manual check 4.

## 2026-10-23 — The emoji panel has one frame and all nine category tabs

- **Decision:** the user's UI check 5: the flags tab did not fit and the library's border drew a second square inside
  our panel. Category tabs are 20px with 6px padding (nine fit 288px), the injected style drops the library's outer
  border (our panel is the frame), and the dropdown is 380px wide. Refines "One emoji panel for the dropdown and the
  cover".
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, manual check 5.
