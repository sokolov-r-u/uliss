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
