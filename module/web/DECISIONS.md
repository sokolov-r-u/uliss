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
