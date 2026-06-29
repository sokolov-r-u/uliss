import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

/**
 * OAuth2 Authorization Code + PKCE against the uliss auth-server.
 *
 * - `uliss-spa` is a public client (no secret); oidc-client-ts enables PKCE
 *   automatically for `response_type: 'code'`.
 * - Tokens are kept in `sessionStorage` — a deliberate trade-off for a public SPA
 *   (see plan: BFF/HttpOnly-cookie is backlog).
 * - `automaticSilentRenew` refreshes the access-token silently via the refresh-token
 *   grant (enabled on the server in this phase).
 */
const settings: UserManagerSettings = {
  authority: import.meta.env.VITE_AUTH_AUTHORITY ?? 'http://localhost:9000',
  client_id: import.meta.env.VITE_AUTH_CLIENT_ID ?? 'uliss-spa',
  redirect_uri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? 'http://localhost:3000/callback',
  post_logout_redirect_uri: import.meta.env.VITE_AUTH_POST_LOGOUT_URI ?? 'http://localhost:3000/',
  response_type: 'code',
  scope: 'openid profile',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
}

export const userManager = new UserManager(settings)
