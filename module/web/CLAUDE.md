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
  double-invoke). `api/users.ts` — `GET /user/users/me` via `authFetch`; `ui/Shell.tsx` — shell.
- **Notice mechanism + onboarding (see «User onboarding · web UI» below):** reusable
  notification modal over a dimmed/blurred app. `ui/notice/` — presentation
  (`NoticeOverlay` — portal-backdrop with `backdrop-filter: blur`, `Notice` — card with plaque/framed/minimal
  variants, `fields.tsx` — controlled input/select/date-picker fields, `glyphs.tsx`);
  `notifications/NotificationProvider.tsx` — generic notification queue (`useNotice().notify`);
  `onboarding/` — onboarding feature (`OnboardingDriver` mounted in the authed area of `App.tsx`).
  Design source — Claude Design `uliss-notify.jsx` (MCP `DesignSync`).
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

## User onboarding · web UI

The onboarding frontend lives in the SPA and is built on the reusable Notice mechanism (see above);
design source — Claude Design `uliss-notify.jsx`. Onboarding backend — `module/user/user-app/CLAUDE.md`.

- **`onboarding/OnboardingDriver`** is mounted in the authed area (`App.tsx`, next to `Home`). On
  mount it fetches `GET /user/users/me/onboarding` (via `authFetch`) and runs pending messages one
  at a time through `NoticeOverlay` (blocking backdrop over `Home`); once the queue is empty it renders
  `null` — the app underneath becomes accessible again. StrictMode double-fetch is cut off by a `useRef` guard.
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
