/**
 * Thin client for the service-side `/user/oauth2/*` endpoints (provided by the `:security`
 * library, mounted under `/user` by the `user` app). The frontend never talks to the
 * Authorization Server directly — it only ever calls the service it is currently using. Paths
 * are relative: in dev they go through the Vite proxy (same-origin), in prod the frontend is
 * served behind the same origin as the services.
 */
import {clearSession, setTokens, type Tokens} from './tokenStore'

const RETURN_TO_KEY = 'uliss.returnTo'
const LOGIN_RETRIED_KEY = 'uliss.loginRetried'

/** Shape returned by the service `/user/oauth2/callback` and `/user/oauth2/refresh` (snake_case). */
type TokenResponse = {
  access_token: string
  refresh_token: string | null
  expires_in: number
  token_type: string
  id_token?: string | null
}

function toTokens(json: TokenResponse, previousIdToken: string | null): Tokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + json.expires_in * 1000,
    idToken: json.id_token ?? previousIdToken,
  }
}

/** How long a refresh may take: every tab waits for it, so a hung one must not hold them all. */
export const REFRESH_TIMEOUT_MS = 15_000

/** `AbortSignal.timeout` came to browsers later than Web Locks; without it a timer aborts the same way. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms)
  return controller.signal
}

/**
 * Hand control to the service login endpoint via full-page navigation. The service drives the
 * OAuth redirects (→ Authorization Server → login page → back to `/callback`). We remember where
 * the user was so `/callback` can return them there.
 */
export function login(): void {
  // a login restarted from /callback keeps the route saved by the login it replaces
  if (!window.location.pathname.startsWith('/callback') && !window.location.pathname.startsWith('/signed-out')) {
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

/**
 * One-shot read of the saved pre-login route; falls back to home and never loops back to /callback or
 * /signed-out. Only a path of this origin passes: `//host` and `/\host` would leave it.
 */
export function takeReturnTo(): string {
  const to = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  if (!to || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/'
  // resolved against a stand-in origin: anything that leaves it (another host, a protocol) is not an in-app path
  const base = 'https://in.app'
  const url = new URL(to, base)
  if (url.origin !== base) return '/'
  if (url.pathname.startsWith('/callback') || url.pathname.startsWith('/signed-out')) return '/'
  return url.pathname + url.search
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
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`)
  const tokens = toTokens((await res.json()) as TokenResponse, null)
  setTokens(tokens)
  return tokens
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

/** Any other refresh answer that is not a success; only a server failure (5xx) is worth repeating. */
export class RefreshFailedError extends Error {
  constructor(public readonly status: number) {
    super(`token refresh failed (${status})`)
    this.name = 'RefreshFailedError'
  }
}

/**
 * Rotates the tokens and returns them without storing: the caller stores them only if no other tab changed the session
 * meanwhile. Throws `RefreshRejectedError` on 400/401 and `RefreshFailedError` on any other error status; network
 * failures and a timeout after [REFRESH_TIMEOUT_MS] stay plain errors.
 */
export async function refreshTokens(refreshToken: string, idToken: string | null = null): Promise<Tokens> {
  const res = await fetch('/user/oauth2/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: timeoutSignal(REFRESH_TIMEOUT_MS),
  })
  if (res.status === 400 || res.status === 401) throw new RefreshRejectedError(res.status)
  if (!res.ok) throw new RefreshFailedError(res.status)
  return toTokens((await res.json()) as TokenResponse, idToken)
}

/**
 * Best-effort refresh-token revocation on the service; always clears local tokens. Returns where the browser must go
 * to end the auth server's own session (its end-session endpoint), or null when there is nothing to hint with.
 */
export async function logout(refreshToken: string | null, idToken: string | null = null): Promise<string | null> {
  let redirectUrl: string | null = null
  if (refreshToken) {
    try {
      const res = await fetch('/user/oauth2/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, idToken }),
      })
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { redirectUrl?: unknown }
        if (typeof body.redirectUrl === 'string') redirectUrl = body.redirectUrl
      }
    } catch {
      // ignore — logout is best-effort
    }
  }
  clearSession()
  return redirectUrl
}
