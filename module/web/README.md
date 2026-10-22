# Web application

`module/web` (`@uliss/web`) is a React/Vite single-page application using `@uliss/design-system`. It provides
authentication callbacks, persistent navigation, onboarding, chat, settings, and honest empty states for product areas
whose backends do not exist yet.

## Authentication and networking

The SPA uses only relative same-origin routes. In development, Vite proxies `/user` and `/note` using node-side
environment variables; those service addresses are not included in the browser bundle.

- `auth/tokenStore.ts` stores access and refresh tokens in `sessionStorage`.
- `auth/authApi.ts` calls the shared security mediator under `/user/oauth2/*`.
- `auth/apiClient.ts` provides `authFetch`, adds bearer authorization, refreshes proactively and after authentication
  failures, and redirects to login when refresh cannot recover.
- `pages/Callback.tsx` exchanges the authorization code once and restores the original route.

The HTML entry applies the persisted ground, accent, and reading-size theme before React renders. Hashed assets are
cacheable; HTML is served with `no-store` behavior.

## Application shell

`AppShell` stays mounted around routed content and hosts onboarding once per authenticated session. The CSS-only shell
uses a mobile screen TopBar and drawer below 768px, a permanent compact rail from 768–1023px, and a bounded,
collapsible/resizable sidebar from 1024px. Routes cover chats, notes,
constellations, sky, updates, search, and settings; unknown routes return to chats.

Updates and search currently have no complete backend. Their screens use design-system empty
states instead of simulated data. Notes use the note-service list, detail, and authenticated status-stream contracts. A status stream that ends
without `READY`/`FAILED` (the service closes it after 10 minutes) is re-read and reconnected while the note is still
generating, up to `MAX_STATUS_RECONNECTS` times per load. A `READY` note with `updating: true` keeps its content
visible under an "Updating this note…" notice and is re-read when the update finishes.
Appearance settings are functional and persisted locally; other settings remain limited to behavior supported by
current APIs.

Those backend-less areas are split into typed, data-independent view components and production adapters.
`NoteViewModel` and `UpdateViewModel` are frontend-only composition models, not future DTOs.
The views include populated list/menu/dialog, search, and update queue/filter/Undo
presentation; production adapters pass empty collections or no graph model until real endpoints exist.

## Sky

`sky/` draws `GET /note/sky` as one live graph around YOU: `skyModel` builds the full graph (YOU → root →
sub-constellation → star by its main constellation → sub-star; secondary edges to a star's other constellations) and
the view subsets (Skeleton, Focus with depth 1–3, Full); `skyLayout` runs the `d3-force` layout, where stars with no
place are pushed to a rim that grows with the number of stars; `SkyCanvas` paints it in screen space with zoom, pan,
pinch, star dragging, Names, the replay (`run`) and the branch filter dimming. Sky settings (`skySettings`) are words
translated to coefficients in one table and are stored per device under `uliss.sky`. The filter's
`ConstellationPicker` holds the notes too: picking one filters by its main constellation (none without one), switches
to Full when the current view does not show the star, and opens the star's panel.

## Constellations

`constellationApi.ts` wraps the note-service tree API (`/note/constellations`); `constellationTree.ts` builds the tree
from the flat list (siblings by name, subtree counts) and mirrors the 1–40 code point name rule. The screen shows the
tree collapsed to its roots; selecting a branch unfolds it and opens the branch panel (`ContextPanel`: a rail from
768px, a right drawer on the phone) with Rename, Change colour (`ConstellationColorEditor`: hue for a root, lightness
for a sub-constellation), New sub-constellation, Move (`ConstellationPicker` without the branch and its descendants,
"Make it a root" first) and Delete (the branch with its sub-constellations). Every change re-reads the tree; a refusal
(taken name, cycle, gone) stays in the dialog or the panel. "Notes here" stays empty until notes join constellations.

## Chat

`chatApi.ts` contains thin authenticated API wrappers. `lib/sse.ts` parses arbitrary SSE frames from an authenticated
`ReadableStream`, while `streamChatReply.ts` handles the chat event names. The SPA sends messages only through
`POST /note/chats/{chatId}/messages`; the removed synchronous message and one-shot `/note/ask` contracts have no
frontend callers.

Opening a chat loads the latest 50 persisted messages. Reaching the top requests the next older
page with the backend-provided exclusive cursor, deduplicates by message ID, and prepends it while
preserving the visible scroll anchor. Only one older-page request runs at a time; pagination stops
at `hasMore=false`, and route changes abort stale requests. The top of the thread exposes loading
and beginning-of-conversation states.

On send, `ChatPage` adds optimistic user and assistant entries and streams tokens. Until the reply's first text, the
assistant entry shows the design system's `PendingStatus`: `thinking…`, or `searching notes…` while the `activity`
event says the assistant is searching the user's notes; unknown activity values are ignored. Send stays locked through persistence
reconciliation; Stop aborts the stream and polls for the corresponding `PARTIAL` or `FAILED` assistant reply for up to
15 seconds. A trailing persisted user message is reconciled after refresh as well. Persisted `COMPLETE`, `PARTIAL`, and
`FAILED` statuses remain authoritative. Reconciliation refreshes the latest page, replaces overlapping persisted rows,
and appends new tail rows without discarding older pages already loaded. A failed reconciliation requires an explicit
retry before another turn. The request and polling are aborted on route changes.

Every `ChatComposer` (chat, new chat, note edit command) dictates through `voice/useDictation`: the mic records one
file with `MediaRecorder` (WebM/Opus, Ogg or MP4, whichever the browser supports) up to the limit from
`GET /note/speech/settings`, then posts it to `POST /note/speech/transcriptions`. Stop appends the text to the draft,
Send submits it at once, and reaching the limit acts as Stop. A failed upload keeps the recording in memory for a
manual retry; leaving the screen discards it. The mic is disabled where the browser cannot record — including any
page that is not a secure context, which is why compose serves `https://uliss.home` (`docs/DEPLOYMENT.md`).

The new-chat actions open `/chats/new` without calling the backend. On the first non-blank submission, the SPA sends
only
the prompt and one request `Idempotency-Key` to the initial-message stream endpoint. The backend generates `Chat-Id` and
`Chat-Turn-Id`, atomically derives the title, creates the chat, reserves its first turn, and persists the user message
before provider streaming begins. The SPA persists the request key until those identities are recovered, then replaces
the route with the persisted chat URL.

The first Summarize of a chat asks for an optional name (`SummaryNameField`: DS `TextField` with a soft 50-character
limit and a mic that dictates up to 30 seconds through `useDictation`'s own limit; chat dictation keeps the service
limit) and a place (DS `PlaceField`: one collapsed line; a click turns the same dialog into its "Choose a place"
step — `Notice` `step`, same card and size — with `SummaryPlacePicker`, the `ConstellationPicker` over every
constellation and note from `GET /note/sky` read by `useSummaryPlaces`; a picked note becomes the parent; Back and
Escape return to the first step). The dialog's one action,
Summarize, starts the summary; an empty place leaves the note without a constellation. Its close button, Escape and a
click on the backdrop close it without a note. A name over 50 characters is never cut: the field turns terracotta and
Summarize stays unavailable until it is shortened, as it does while the name is being dictated. A blank name lets Uliss name the note. A later Summarize asks to update the note. Summarize then accepts the asynchronous placeholder without waiting for generation and links to
`/notes/:noteId`. A generating note follows the authenticated status SSE; `READY` triggers a JSON detail re-fetch, while
`FAILED` remains visible. A stored note `title` is shown in the list and above the detail content; notes without
one fall back to their first content line. Note content is rendered as Markdown (date headings accented only for chat
summaries). Unsupported rename and delete actions are not shown.

A settled `READY` note has an Edit button (disabled while a summary update runs). Edit mode is `NoteEditForm`: a title
field and `NoteEditor` — TipTap with `@tiptap/markdown` and the design system's `EditorToolbar` — so the user formats
without seeing Markdown; the extensions also cover tables, code, links and quotes so an edit keeps them. `Original`
shows the saved version in place of the editor without losing edits. Save sends `PUT /note/notes/{noteId}` with the
version the edit started from; an unchanged text goes back as stored. Cancel with edits asks first, and closing the tab
with edits triggers the browser warning; leaving through an in-app link does not (see `docs/TECH_DEBT.md`).

## Onboarding

`OnboardingDriver` requests pending messages from `/user/users/me/onboarding` and displays them sequentially over the
application. The display-name step is blocking. Profile completion accepts gender and a local ISO date and can be
skipped by submitting empty optional fields. The API response, not a design mockup, determines whether a step is
blocking.

## Design provenance and verification

The visual system originated in an external Claude Design project. Committed design-system tokens, components, and
adjacent `.prompt.md` usage rules are the available source of truth unless an external reference is explicitly provided.

```bash
npm run typecheck -w @uliss/web
npm run build -w @uliss/web
npm run test -w @uliss/web
```

The repository rules prohibit starting Vite dev or preview servers without explicit permission.

## Visual and keyboard harness

`visual/index.html` is a test-only Vite entry. Its fixtures live outside `src`, so the production Rollup graph cannot
import them. Playwright covers the reference phone/tablet/landscape/desktop viewports, theme/read combinations,
reduced-motion, dialogs, pending/disabled states, native tab order, listbox keys, focus traps, and static source rules.

```bash
npm run visual:test -w @uliss/web
npm run visual:update -w @uliss/web
```

Both commands run the complete Playwright suite in the version-pinned `linux/amd64` container used by GitHub Actions.
That container is the canonical screenshot platform; do not update baselines with a native macOS or arm64 Playwright
run. The commands start the harness server inside Docker and therefore require the explicit application-run permission
described in the repository instructions.

For a failure, rerun only the exact Playwright title first. Additional Playwright arguments are forwarded into the
container:

```bash
npm run visual:test -w @uliss/web -- --grep "chats-conversation · phone"
```

Inspect the generated `expected`, `actual`, and `diff` files under `visual/test-results`. If the change is unintended,
fix the source and repeat the targeted test. If the new rendering is accepted, update only that target and verify it:

```bash
npm run visual:update -w @uliss/web -- --grep "chats-conversation · phone"
npm run visual:test -w @uliss/web -- --grep "chats-conversation · phone"
```

Use the local `visual:serve` harness for fast manual iteration, but never generate canonical baselines on the host.
Run the complete Docker suite once, after all targeted tests pass, before committing. Do not start with a full snapshot
update: it can accept unrelated regressions and makes the review surface unnecessarily large.
