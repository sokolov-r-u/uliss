/**
 * Thin client for the service-side `/user/oauth2/*` endpoints (provided by the `:security`
 * library, mounted under `/user` by the `user` app). The frontend never talks to the
 * Authorization Server directly — it only ever calls the service it is currently using. Paths
 * are relative: in dev they go through the Vite proxy (same-origin), in prod the frontend is
 * served behind the same origin as the services.
 */
import {clearTokens, setTokens, type Tokens} from './tokenStore'

const RETURN_TO_KEY = 'uliss.returnTo'
const LOGIN_RETRIED_KEY = 'uliss.loginRetried'

/** Shape returned by the service `/user/oauth2/callback` and `/user/oauth2/refresh` (snake_case). */
type TokenResponse = {
  access_token: string
  refresh_token: string | null
  expires_in: number
  token_type: string
}

function toTokens(json: TokenResponse): Tokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
}

async function readTokens(res: Response, what: string): Promise<Tokens> {
  if (!res.ok) throw new Error(`${what} failed (${res.status})`)
  const tokens = toTokens((await res.json()) as TokenResponse)
  setTokens(tokens)
  return tokens
}

/**
 * Hand control to the service login endpoint via full-page navigation. The service drives the
 * OAuth redirects (→ Authorization Server → login page → back to `/callback`). We remember where
 * the user was so `/callback` can return them there.
 */
export function login(): void {
  // a login restarted from /callback keeps the route saved by the login it replaces
  if (!window.location.pathname.startsWith('/callback')) {
    sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.search)
  }
  window.location.href = '/user/oauth2/login'
}

/**
 * Restarts a rejected login once (its cookies expired or were set on another host). The auth server usually still
 * holds the signed-in session, so the new login passes without the form. Returns false when this login already is
 * the retry: the caller shows the error, and the next manual attempt may retry once again.
 */
export function retryLoginOnce(): boolean {
  if (sessionStorage.getItem(LOGIN_RETRIED_KEY)) {
    sessionStorage.removeItem(LOGIN_RETRIED_KEY)
    return false
  }
  sessionStorage.setItem(LOGIN_RETRIED_KEY, '1')
  login()
  return true
}

/** A completed login ends the retry window. */
export function clearLoginRetry(): void {
  sessionStorage.removeItem(LOGIN_RETRIED_KEY)
}

/** One-shot read of the saved pre-login route; falls back to home and never loops back to /callback. */
export function takeReturnTo(): string {
  const to = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  if (to && to.startsWith('/') && !to.startsWith('/callback')) return to
  return '/'
}

/**
 * Exchange the authorization code for tokens. `credentials:'include'` sends the code_verifier and state cookies;
 * the service rejects a `state` that differs from the one this browser received at login.
 * Throws `LoginRejectedError` on 400; network and server failures stay plain errors.
 */
export async function exchangeCode(code: string, state: string): Promise<Tokens> {
  const query = new URLSearchParams({code, state})
  const res = await fetch(`/user/oauth2/callback?${query}`, {
    method: 'POST',
    credentials: 'include',
  })
  if (res.status === 400) throw new LoginRejectedError()
  return readTokens(res, 'token exchange')
}

/** The service rejected this login (state mismatch, expired login cookies, or an invalid code): start it again. */
export class LoginRejectedError extends Error {
  constructor() {
    super('sign-in session rejected')
    this.name = 'LoginRejectedError'
  }
}

/** The service refused the refresh token itself (expired, revoked, or already rotated): the session is over. */
export class RefreshRejectedError extends Error {
  constructor(public readonly status: number) {
    super(`token refresh rejected (${status})`)
    this.name = 'RefreshRejectedError'
  }
}

/** Rotates the tokens. Throws `RefreshRejectedError` on 400/401; network and server failures stay plain errors. */
export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const res = await fetch('/user/oauth2/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (res.status === 400 || res.status === 401) throw new RefreshRejectedError(res.status)
  return readTokens(res, 'token refresh')
}

/** Best-effort refresh-token revocation on the service; always clears local tokens. */
export async function logout(refreshToken: string | null): Promise<void> {
  if (refreshToken) {
    try {
      await fetch('/user/oauth2/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      // ignore — logout is best-effort
    }
  }
  clearTokens()
}
