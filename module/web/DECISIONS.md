# Architecture decisions: web

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-15 — A status stream that ends early is reconnected

- **Context:** note-service closes a note status stream after 10 minutes; a summary can take longer.
- **Decision:** `streamNoteStatus` resolves `null` when the stream ends without READY/FAILED; `NoteDetailPage`
  re-reads the note and reconnects while it is generating, up to `MAX_STATUS_RECONNECTS` per load, then offers Retry.
- **Source:** commit `77a398b`.

## 2026-10-15 — Sign-in errors are typed, not raw messages

- **Decision:** a 400 from the callback is `LoginRejectedError` ("session expired, start again"); `Callback`
  separately reports a refused/cancelled login (`error=` parameter) and an incomplete link. A refresh rejected with
  400/401 is `RefreshRejectedError` and signs in again; other refresh failures are `SessionRefreshError` and keep the
  tokens.
- **Source:** commits `e39eef3` (`SessionRefreshError`), `9ff64fe`, `9fe4851`.

## 2026-10-17 — Notes are edited visually with TipTap

- **Context:** users edit notes stored as Markdown and should not see Markdown syntax.
- **Decision:** `NoteEditor` uses TipTap 3 with the official `@tiptap/markdown` (pinned exactly; its docs are Beta).
  The toolbar is the design system's `EditorToolbar`; the TipTap engine stays in `web`, out of the design system. The
  extensions cover more than the toolbar inserts (tables, code, links, quotes, strikethrough), so a pass through the
  editor renders the same; raw HTML is reduced to known nodes or dropped. "Changed" compares against the editor's own
  serialization of the untouched note, and an untouched text is saved as stored. Every note's content is now rendered
  as Markdown, not only chat summaries.
- **Consequences:** the serializer may respell equivalent Markdown (for example `*` lists as `-`) in edited notes.
- **Source:** task `docs/tasks/2026-10-17-note-manual-edit.md`, blocks 3–4.


## 2026-10-17 — The web container redirects to one canonical host

- **Context:** the mediator's login cookies are host-only and the OAuth callback always returns to
  `http://uliss.home/callback`; a login started on another Host (the VPN IP) lost its cookies and failed with 400.
- **Decision:** `nginx.conf.template` serves only `WEB_CANONICAL_HOST` (default `uliss.home`); the default server
  answers every other Host with a 301 to it. The Compose healthcheck calls `127.0.0.1` with that Host.
- **Source:** task `docs/tasks/2026-10-17-auth-login-glitches.md`, block 1.

## 2026-10-17 — A rejected login is restarted once before the error

- **Context:** replaces the part of "Sign-in errors are typed, not raw messages" (2026-10-15) that showed the
  `LoginRejectedError` message at once. The auth server usually still holds the signed-in session, so a new login
  passes without the form.
- **Decision:** `Callback` restarts the login once (`retryLoginOnce`, flag in `sessionStorage`, cleared on success)
  and shows "session expired" only when the restart is rejected too. `login()` from `/callback` keeps the saved
  return route.
- **Source:** task `docs/tasks/2026-10-17-auth-login-glitches.md`, block 2.

## 2026-10-17 — The canonical-host redirect is a 302

- **Decision:** replaces the 301 in "The web container redirects to one canonical host": a browser caches a 301, so
  `localhost:80` would keep redirecting to `uliss.home` after another app takes the port or the host changes.
- **Source:** task `docs/tasks/2026-10-17-auth-login-glitches.md`, code-review fixes.

## 2026-10-17 — A model rewrite is one undo step of the note editor

- **Context:** note edit mode gets a command field for the model (task 2 of the note-editing epic).
- **Decision:** the command field is the chat's `ChatComposer` at the foot of edit mode, with example commands as a
  rotating placeholder and no history. The streamed text is shown read-only in place of the editor; on `done` it
  replaces the editor's text with one `setContent`, so Undo/Redo switch between versions and Original still shows the
  saved note. There is no separate diff view or accept/reject step. Text from a stopped or failed stream is dropped.
  Nothing reaches the server until Save.
- **Source:** task `docs/tasks/2026-10-17-note-ai-edit.md`, block 2.

## 2026-10-17 — Dictation lives in ChatComposer

- **Context:** voice input is wanted in every chat composer at once (chat, new chat, note edit command).
- **Decision:** `ChatComposer` owns dictation through `useDictation`; the DS `ChatDock` only draws the
  `recording` / `transcribing` / `failed` states. Recognized text is appended to the draft, and Send passes the new draft
  to `onSubmit(text)` because the owner's state has not caught up yet. Wording of voice errors sits in a line above the
  dock. Only the user retries a failed transcription, with the same recording and intent.
- **Source:** task `docs/tasks/2026-10-17-voice-input.md`, block 3.

## 2026-10-19 — A note's places are edited only from its panel

- **Context:** task 2 of the constellations epic; the meta plate above the note text (board 16c) is not built.
- **Decision:** the "Constellation" section opens the note's panel. The main place is a breadcrumb with Change (pick a
  new main, the old one is dropped) and Remove; "Also in" chips make a place main on click and remove it with ×;
  "+ Add constellation" adds one. Every pick goes through the DS `ConstellationPicker`, whose "Create “…”" creates a
  root and places the note there. The Constellations screen shows the service's distinct subtree counts as they are
  (the client no longer sums children), lists "Notes here" per branch, ends the tree with a muted "Without
  constellation" row when such notes exist, and asks where to move the notes before deleting a branch that holds some.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, block 4.

## 2026-10-19 — The place-picker walks the tree; panels drop their visible title

- **Context:** the manual test of task 2: the picker listed the whole tree unfolded, and the note panel spent space on
  a title and a hint that said nothing.
- **Decision:** `ConstellationPicker` (DS) opens on the roots; a click selects a branch and unfolds it, the chevron
  only folds, and an action button ("Add to Jazz", "Move to Jazz", "Make Jazz main") confirms. Search shows flat hits
  with their path. `onCreate(name, parentId)` creates under the selection ("+ New in …", "Create “…” in …") or a root
  and selects the new branch; the note is placed only by the action button. The note section shows the main place,
  Change and × in one line, chips with a "Make … main" tooltip, no hint. `ContextPanel` keeps its label for assistive
  tech only and shows just the close button.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, blocks 6–7.

## 2026-10-19 — The main place is chosen among the note's own places

- **Decision:** replaces the chip click and Change of the previous entry. A click on the main path lists the note's
  other places and makes the chosen one main (the old main stays a place); with a single place the path is inactive.
  Chips only show a place and remove it; there is no "Also in" label. Adding stays with the tree picker.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, manual test of round 2.

## 2026-10-19 — Sub-notes in the web app

- **Context:** task 4 of the constellations epic nests notes under notes; the prototype has no screens for it.
- **Decision:** `ConstellationPicker` takes optional `notes` (`search`, `action`, `onPick`): typing also asks the
  server for notes (after a 250 ms pause, stale searches aborted) and lists them under the constellations with their
  path. Summarize uses both ("Summarize into Jazz" / "Summarize under Bowie"); "Move under a note" uses the same picker
  with no constellations; Add, Move of a branch and the delete dialog stay constellation-only, since a note cannot be
  their target. The note panel shows a sub-note's path through its parent notes (links) with "Lives where … lives.",
  "Move out" (tree picker with "Leave without a place") and "Move under another note"; "Sub-notes" lists the direct
  children. "Notes here" and "Without constellation" nest by `parentNoteId`, folded, a chevron per level. Deleting a
  note first counts its sub-notes; with any, the dialog offers Keep sub-notes (default) or Delete all, and a
  `NOTE_HAS_SUB_NOTES` refusal recounts and asks.
- **Source:** task `docs/tasks/2026-10-19-constellations-subnotes.md`, block 3.

## 2026-10-20 — The sky renderer

- **Context:** the Sky screen draws the user's constellations and notes as a live force graph (PROT Sky, board 17).
- **Decision:** the renderer lives in `module/web/src/sky`, not the design system: it is one screen bound to the sky
  snapshot. Physics is `d3-force` alone (not all of `d3`), pinned to an exact version. Every view is a subset of one
  graph built from `GET /note/sky`; each view keeps its own last positions, so a reload or a mode switch does not
  throw the layout away, and a fresh view is solved to rest synchronously before its first frame. The canvas paints
  in screen space from world positions, so marks and names keep their size at any zoom. Stars with no place get no
  edge and a radial rim force: the rim lies beyond the farthest placed node by a gap growing with √(stars), with a
  floor for an almost empty sky; its coefficients live in `skyModel.rimRadius` and are not a setting. A star in
  several constellations is split into sectors when the user turns Mix colours on. Sky settings are per device
  (`localStorage`, versioned, merged with defaults).
- **Consequences:** SVG plus a React render per tick is enough for hundreds of stars; thousands need Canvas or a
  worker (`docs/TECH_DEBT.md`). Positions are not kept between visits, so the sky can open slightly differently
  after notes change.
- **Source:** task `docs/tasks/2026-10-20-sky.md`, block 3.

## 2026-10-20 — One sky layout for every view

- **Context:** replaces, in "The sky renderer" above, the per-view layouts; after the first manual check the user
  wanted entering Focus not to move the sky.
- **Decision:** the simulation always holds the whole graph with YOU pinned at the centre; Skeleton, Focus and Full
  only hide and show nodes and edges, without re-centring or re-framing. In Focus YOU stays where it is and leads out
  of Focus on click. A star or its name opens the note panel in every view, Full included — a deliberate departure
  from Product Logic ("Full — без панели ноды"), the user's call. The star under the mouse and the five nearest within
  120 px are always named; a press travelling under 6 px is a click.
- **Source:** task `docs/tasks/2026-10-20-sky.md`, block 5.

## 2026-10-20 — Back from an open note or chat

- **Context:** Product Logic keeps the note header without a way back; Back existed only on a note opened from the
  chat delete dialog. With the sky, the user wants to return to it from a note in one click.
- **Decision:** the header of an open note and of an open chat shows Back (`ui/BackButton`, `navigate(-1)`) whenever
  the screen was reached inside the app; a screen opened directly (the router's `default` entry) has none. On the
  delete-dialog path the note keeps its own accented Back and the header one is hidden. Lists keep no Back.
- **Source:** task `docs/tasks/2026-10-20-sky.md`, block 6.

## 2026-10-20 — The star panel is the note's details panel

- **Decision:** the open note's details panel content is one component (`notes/NoteDetailsSections`: Constellation,
  Sub-notes, Written from, Dates); the sky's star panel shows the same sections under the note's title, the start of
  its text and Open note. `NoteConstellationSection` reports every stored change through `onChanged`, and the sky
  reloads its snapshot on it. The mouse on an edge lights up and names its two nodes; how many stars near the pointer
  are named (0–10) and how far (Close · Medium · Wide · Vast) are sky settings.
- **Source:** task `docs/tasks/2026-10-20-sky.md`, block 8.

## 2026-10-21 — The heavy screens load on first visit

- **Context:** the first page carried the editor, the constellation tree and the sky renderer (1.14 MB).
- **Decision:** `NoteDetailPage`, `ConstellationsPage` and `SkyPage` are `lazy` routes inside `ui/ScreenLoadBoundary`:
  "Loading…" while the chunk arrives, and a Reload offer when it cannot (after a deploy an open tab asks for chunk
  names that are gone), instead of a blank app.
- **Consequences:** the first bundle is about half the size; the first visit to those screens waits for one chunk.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 22 and the code review round.

## 2026-10-21 — On the sky screen Tab always lands on the graph

- **Context:** the graph sat behind about twenty Tab stops (the side navigation and its lists); a missed star meant
  going round them all again. A skip link was tried and dropped as no help.
- **Decision:** the user's choice: on the sky screen Tab and Shift+Tab from anywhere move focus to the graph's single
  tab stop (roving tabindex, arrows move by direction, Escape leaves Focus and then the star) and do not leave it.
  Open panels of the sky, an open mobile drawer, dialogs and menus keep their own Tab order; a sky with nothing to
  pick keeps the normal order.
- **Consequences:** on the sky screen the side navigation and the controls around the graph are not reachable by
  keyboard (mouse only), against WCAG 2.1.2 (No Keyboard Trap); revisit when keyboard access to them is needed.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, manual test rounds 1–3 and the code review round.

## 2026-10-21 — The web image upgrades its Alpine packages

- **Context:** Alpine publishes package fixes before a new `nginx:*-alpine` image, and `scan-images` fails on them
  (`libexpat`, `libx11` in `nginx:1.31.7-alpine`).
- **Decision:** the final stage of `module/web/Dockerfile` runs `apk upgrade --no-cache` on top of the pinned digest.
- **Consequences:** the image is no longer fully defined by the digest: the same Dockerfile built on another day may
  carry newer packages. The GitHub Actions layer cache keeps the upgraded layer until the Dockerfile or the digest
  changes, so later Alpine fixes arrive with the monthly Dependabot digest bump.
- **Source:** task `docs/tasks/2026-10-21-image-security-fixes.md`, block 3.
