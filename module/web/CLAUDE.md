# CLAUDE.md — `web`

Guide for `module/web` (`@uliss/web`, React SPA). Cross-cutting rules (workflow, conventions, closed
decisions) — in the root `CLAUDE.md`, read it first. How the SPA obtains tokens through the
mediator service — `module/lib/security/CLAUDE.md` (section «SPA token strategy»).

## Web SPA (React + Vite)

- npm package `@uliss/web` (workspace member). Stack: React 19, React Router 7, Vite 6 (**without**
  `oidc-client-ts` — all auth logic is custom), design system via `@uliss/design-system`
  (`module/lib/uliss-design-system/CLAUDE.md`).
- **`auth/` structure:** `tokenStore.ts` — tokens in `sessionStorage`; `authApi.ts` — calls to the
  service's `/user/oauth2/*` (`login`/`exchangeCode`/`refreshTokens`/`logout`, `returnTo`);
  `apiClient.ts` — `authFetch` (single entry point for protected calls: Bearer + proactive/reactive
  refresh); `AuthContext.tsx` — React wrapper. `pages/Callback.tsx` — accepts `?code`, POSTs to the
  service's `/user/oauth2/callback`, returns the user to `returnTo` (guard against StrictMode
  double-invoke). `ui/Shell.tsx` — the transient centered-panel shell used only by `Callback` and the
  `RequireAuth` "redirecting…" gate; the authenticated app itself uses `ui/AppShell.tsx` (see «App
  shell & navigation» below), not `Shell`.
- **Notice mechanism + onboarding (see «User onboarding · web UI» below):** reusable
  notification modal over a dimmed/blurred app. `ui/notice/` — presentation
  (`NoticeOverlay` — portal-backdrop with `backdrop-filter: blur`, `Notice` — card with plaque/framed/minimal
  variants, `fields.tsx` — controlled input/select/date-picker fields, `glyphs.tsx`);
  `notifications/NotificationProvider.tsx` — generic notification queue (`useNotice().notify`);
  `onboarding/` — onboarding feature (`OnboardingDriver`, mounted once in `ui/AppShell.tsx` — see
  «App shell & navigation» below). Design source — Claude Design `uliss-notify.jsx` (MCP `DesignSync`).
- **Same-origin, no service URLs in the browser:** all calls are **relative**, each service under its
  own name (`/user/oauth2/*`, `/user/users/*` — user-service; see «Path-prefix convention» in the root
  `CLAUDE.md`). In dev they're proxied by Vite (`vite.config.ts`: `/user` → `USER_SERVICE_URL`, `/note` →
  `NOTE_SERVICE_URL`); in prod the frontend is served from the same origin as the services (nginx/gateway).
  The browser doesn't know the AS/service addresses.
- **Config via env:** `VITE_*` variables for auth **no longer exist** (removed along with `oidc.ts`).
  `USER_SERVICE_URL` (**without** the `VITE_` prefix) is read only by `vite.config.ts` (node-side, `loadEnv(…, '')`)
  for the dev-proxy target — it never ends up in the browser bundle. Dev port `3000` (`strictPort`).
- **Anti-cache:** the `noStoreHtml` plugin sends `Cache-Control: no-store` on `index.html` (both in dev and in
  `vite preview`), hashed assets `/assets/*` are immutable.

```bash
npm run dev -w @uliss/web        # Vite dev server on :3000
npm run build -w @uliss/web      # tsc --noEmit + vite build
npm run typecheck -w @uliss/web  # tsc --noEmit
```

## App shell & navigation

- `App.tsx` — under `RequireAuth`, a single layout route renders `ui/AppShell.tsx`, with `/chats`,
  `/chats/:chatId`, `/journal`, `/graph` as nested `<Outlet/>` routes (`/` redirects to `/chats`,
  unknown paths too). `AppShell` is the authenticated app's persistent frame — it stays mounted
  across navigation between those routes, only the `<Outlet/>` content swaps.
- **`ui/AppShell.tsx`** — mobile: hamburger `ui/nav/TopBar.tsx` + overlay drawer; desktop (`900px`
  breakpoint, `ui/AppShell.css`): permanent nav rail, `TopBar` hidden. One `ui/nav/SideNav.tsx`
  component for both — responsive purely via CSS (transform/`display: none`), no `matchMedia`/JS
  breakpoint logic. `OnboardingDriver` (see below) is mounted here, not per-page, so it runs once per
  session rather than remounting on every chat/journal/graph navigation.
- **`ui/icons.tsx`** — hand-rolled inline SVGs for nav/composer chrome, same convention as
  `ui/notice/glyphs.tsx` (plain functions, `stroke="currentColor"`, square line caps — the brand has
  no border-radius anywhere, `--radius: 0`).
- **Design mockups are a visual reference only, not literal code** — the desktop treatment in the
  Claude Design mockups (`uliss-desktop.jsx`) floats a fixed-size window on a canvas; that's a
  presentation-artboard convention. The real app uses an ordinary full-bleed responsive layout.
- **`ui/TbdPage.tsx`** — shared empty-state shell (kicker + heading + description + a "to be
  developed" badge) for design areas sketched in the mockups that have no backend yet
  (`journal/JournalPage.tsx`, `graph/GraphPage.tsx`). Real page chrome, no fabricated data — add a
  real implementation here once the corresponding backend exists, don't extend the stub in place.

## Chat UI

Frontend for the `note-service` chat feature (`module/note/note-app/CLAUDE.md` — backend contract:
create/list chats, list messages, synchronous + SSE-streaming replies under `/note/chats`).

- **`src/lib/sse.ts`** — `parseSseStream(body, signal)`, a generic SSE parser over a
  `ReadableStream<Uint8Array>`. Exists because native `EventSource` can't send the `Authorization`
  header, so streaming responses go through `authFetch` + `response.body` instead — protocol-only
  (no chat-specific event names), reusable by any future streaming feature.
- **`src/chat/chatApi.ts`** — thin `authFetch` wrappers (`listChats`/`createChat`/`getMessages`/
  `sendMessage`), same per-domain-module pattern as `onboarding/onboardingApi.ts`.
- **`src/chat/streamChatReply.ts`** — `streamAssistantReply(chatId, content, {onToken, signal})`
  drives `parseSseStream` over the `/messages/stream` endpoint, dispatching the backend's `token`/
  `done`/`error` events and returning `'done' | 'error'`.
- **`src/chat/ChatListPage.tsx`** (route `/chats`, the post-login landing page) — lists chats, "new
  chat" creates one and navigates in.
- **`src/chat/ChatPage.tsx`** (route `/chats/:chatId`) — on send, appends an optimistic user bubble +
  a streaming assistant placeholder (`Bubble.tsx`'s `pending` flag), then **always re-fetches
  `getMessages` once the stream ends** (success or error) and replaces state with the server's
  truth. This is what makes `ChatMessageStatus` (`COMPLETE`/`PARTIAL`/`FAILED`) rendering automatic
  with zero client-side guessing about what actually got persisted — `PARTIAL`/`FAILED` just show a
  small status badge in `Bubble`. Aborts the in-flight stream on unmount (`AbortController`).
- **`src/chat/MicButton.tsx`** — always `disabled` (`title="Voice input coming soon"`); there's no
  speech-to-text backend, so chat is text-only even though the design mockup pairs it with voice
  recording.

## User onboarding · web UI

The onboarding frontend lives in the SPA and is built on the reusable Notice mechanism (see above);
design source — Claude Design `uliss-notify.jsx`. Onboarding backend — `module/user/user-app/CLAUDE.md`.

- **`onboarding/OnboardingDriver`** is mounted once in `ui/AppShell.tsx` (see «App shell &
  navigation» above), not per-page. On mount it fetches `GET /user/users/me/onboarding` (via
  `authFetch`) and runs pending messages one at a time through `NoticeOverlay` (blocking backdrop
  over the app); once the queue is empty it renders `null` — the app underneath becomes accessible.
  StrictMode double-fetch is cut off by a `useRef` guard.
- **Steps (`onboarding/steps.tsx`)** — each owns its own local state and POSTs itself:
  `DisplayNameStep` (`SET_DISPLAY_NAME`, blocking, primary «Continue» is disabled while the field is empty,
  `400` → inline error) and `ProfileStep` (`COMPLETE_PROFILE`, gender+date, primary «Begin» sends the entered
  data, secondary «Skip» → POST with empty fields = `SKIPPED`). `blocking` is taken **from the API response's
  `blocking` field**, not from the mockup (in the design both screens are blocking, but the backend marks
  `COMPLETE_PROFILE` as optional → it has a «Skip»).
- **Contract (`onboarding/onboardingApi.ts`):** `Gender` = `MALE|FEMALE|OTHER`, `birthDate` — ISO
  `YYYY-MM-DD` (the date-picker returns a local date with no TZ shift). Label↔`Gender` mapping is in `steps.tsx`.
- **User profile has no UI screen yet** — onboarding is the only current consumer of the feature;
  the generic dispatch-notification mechanism (`kind="info"`) supports it, but the backend doesn't emit them yet.
