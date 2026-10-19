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
