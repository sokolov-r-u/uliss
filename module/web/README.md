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

`AppShell` stays mounted around routed content and hosts onboarding once per authenticated session. The layout uses a
mobile top bar/drawer and a permanent desktop navigation rail at the CSS breakpoint. Routes cover chats, notes,
constellations, sky, updates, search, and settings; unknown routes return to chats.

Notes, constellations, sky, updates, and search currently have no complete backend. Their screens use design-system
empty states instead of simulated data. Appearance settings are functional and persisted locally; other settings remain
limited to behavior supported by current APIs.

## Chat

`chatApi.ts` contains thin authenticated API wrappers. `lib/sse.ts` parses arbitrary SSE frames from an authenticated
`ReadableStream`, while `streamChatReply.ts` handles the chat event names.

On send, `ChatPage` adds optimistic user and assistant entries, streams tokens, then always re-fetches message history.
Persisted `COMPLETE`, `PARTIAL`, and `FAILED` statuses therefore remain authoritative. The request is aborted on
unmount. Voice input is visibly disabled because no speech backend exists.

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
```

The repository rules prohibit starting Vite dev or preview servers without explicit permission.

