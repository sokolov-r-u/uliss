/**
 * `getAccessToken` is the only owner of the session: it returns the stored access token or refreshes it,
 * with at most one refresh in flight. `authFetch` — the single entry point for calling the current
 * service's protected API — attaches that token as `Authorization: Bearer` and retries once with a new
 * token on 401 / auth-redirect. Paths are relative (Vite proxy in dev / same-origin gateway in prod).
 */
import {clearTokens, getTokens, isExpired, type Tokens} from './tokenStore'
import {login, RefreshRejectedError, refreshTokens} from './authApi'

/** Thrown once a login/refresh redirect has been triggered — callers should stop, not show an error. */
export class AuthRequiredError extends Error {
  constructor() {
    super('authentication required')
    this.name = 'AuthRequiredError'
  }
}

/** The session could not be refreshed right now (network or server failure); the tokens are kept. */
export class SessionRefreshError extends Error {
  constructor(cause: unknown) {
    super('Could not refresh the session. Check the connection and try again.', {cause})
    this.name = 'SessionRefreshError'
  }
}

function withAuth(init: RequestInit | undefined, accessToken: string): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  // Signal XHR so a service can answer with 401 JSON instead of a browser redirect (if it supports it).
  // Default to JSON, but let a caller override it (e.g. `text/event-stream` for an SSE endpoint) —
  // Spring's content negotiation 406s when Accept doesn't match the handler's `produces`.
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  headers.set('X-Requested-With', 'XMLHttpRequest')
  // `redirect: 'manual'` turns the entry-point 302 into an opaqueredirect we can detect.
  return { ...init, headers, credentials: 'include', redirect: 'manual' }
}

/** 401, or a 302 from the security entry point surfaced as an opaque redirect. */
function needsAuth(res: Response): boolean {
  return res.status === 401 || res.type === 'opaqueredirect'
}

// One refresh at a time: refresh tokens rotate on every use, so a second refresh with the same token would fail
// with invalid_grant and send the user to sign-in.
let refreshing: Promise<Tokens> | null = null

function signInAgain(): never {
  clearTokens()
  login()
  throw new AuthRequiredError()
}

async function runRefresh(refreshToken: string | null): Promise<Tokens> {
  if (!refreshToken) signInAgain()
  try {
    return await refreshTokens(refreshToken)
  } catch (error) {
    if (error instanceof RefreshRejectedError) signInAgain()
    throw new SessionRefreshError(error)
  }
}

function refreshOnce(refreshToken: string | null): Promise<Tokens> {
  refreshing ??= runRefresh(refreshToken).finally(() => {
    refreshing = null
  })
  return refreshing
}

/**
 * A valid access token for any caller: the stored one, or a refreshed one when it has expired or the
 * server rejected `rejected`. Concurrent callers share a single refresh.
 */
export async function getAccessToken(rejected?: string): Promise<string> {
  if (refreshing) return (await refreshing).accessToken
  const tokens = getTokens()
  if (!tokens) signInAgain()
  if (tokens.accessToken !== rejected && !isExpired(tokens)) return tokens.accessToken
  return (await refreshOnce(tokens.refreshToken)).accessToken
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken()
  const res = await fetch(path, withAuth(init, accessToken))
  if (!needsAuth(res)) return res

  const retried = await fetch(path, withAuth(init, await getAccessToken(accessToken)))
  if (needsAuth(retried)) signInAgain()
  return retried
}
