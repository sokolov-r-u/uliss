/**
 * `authFetch` — the single entry point for calling the current service's protected API.
 * Attaches `Authorization: Bearer`, refreshes proactively (by expiry) and reactively (on 401 /
 * auth-redirect), and hands off to login when refresh is impossible. Paths are relative
 * (Vite proxy in dev / same-origin gateway in prod).
 */
import {clearTokens, getTokens, isExpired, type Tokens} from './tokenStore'
import {login, refreshTokens} from './authApi'

/** Thrown once a login/refresh redirect has been triggered — callers should stop, not show an error. */
export class AuthRequiredError extends Error {
  constructor() {
    super('authentication required')
    this.name = 'AuthRequiredError'
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

async function refreshWith(refreshToken: string | null): Promise<Tokens> {
  if (refreshToken) {
    try {
      return await refreshTokens(refreshToken)
    } catch {
      // fall through to login
    }
  }
  clearTokens()
  login()
  throw new AuthRequiredError()
}

/** Fresh tokens for a call that holds `used`: reuse ones another call already stored, else join or start a refresh. */
async function refreshOrLogin(used: Tokens): Promise<Tokens> {
  const stored = getTokens()
  if (stored && stored.accessToken !== used.accessToken && !isExpired(stored)) return stored
  if (!refreshing) {
    refreshing = refreshWith(stored?.refreshToken ?? used.refreshToken).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  let tokens = getTokens()
  if (!tokens) {
    login()
    throw new AuthRequiredError()
  }
  if (isExpired(tokens)) {
    tokens = await refreshOrLogin(tokens)
  }

  let res = await fetch(path, withAuth(init, tokens.accessToken))
  if (needsAuth(res)) {
    tokens = await refreshOrLogin(tokens)
    res = await fetch(path, withAuth(init, tokens.accessToken))
    if (needsAuth(res)) {
      clearTokens()
      login()
      throw new AuthRequiredError()
    }
  }
  return res
}
