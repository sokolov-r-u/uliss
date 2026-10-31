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

/** Pause before repeating a refresh that failed on the network or server side. */
export const REFRESH_RETRY_DELAY_MS = 1_000

/**
 * A failed refresh may still have rotated the token on the auth server (its answer was lost); the auth server accepts
 * a repeat with the old token shortly after, so one retry recovers instead of showing an error.
 */
async function refreshWithRetry(refreshToken: string, idToken: string | null): Promise<Tokens> {
  try {
    return await refreshTokens(refreshToken, idToken)
  } catch (error) {
    if (error instanceof RefreshRejectedError) throw error
    await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS))
    return refreshTokens(refreshToken, idToken)
  }
}

async function runRefresh(refreshToken: string | null, idToken: string | null): Promise<Tokens> {
  if (!refreshToken) signInAgain()
  try {
    return await refreshWithRetry(refreshToken, idToken)
  } catch (error) {
    if (error instanceof RefreshRejectedError) signInAgain()
    throw new SessionRefreshError(error)
  }
}

function refreshOnce(refreshToken: string | null, idToken: string | null): Promise<Tokens> {
  refreshing ??= runRefresh(refreshToken, idToken).finally(() => {
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
  return (await refreshOnce(tokens.refreshToken, tokens.idToken ?? null)).accessToken
}

/**
 * Replaces the access token even while it is still valid, so claims that changed on the server reach the services
 * (e.g. `onboardingRequired` disappears once the last blocking onboarding step is done).
 */
export async function refreshSession(): Promise<void> {
  // a refresh already in flight may have been issued before the server-side change
  if (refreshing) await refreshing.catch(() => undefined)
  await getAccessToken(getTokens()?.accessToken)
}

/** Whether the current access token says blocking onboarding is pending; the services enforce it either way. */
export function tokenRequiresOnboarding(): boolean {
  const payload = getTokens()?.accessToken.split('.')[1]
  if (!payload) return false
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { onboardingRequired?: unknown }).onboardingRequired === true
  } catch {
    return false
  }
}

const ONBOARDING_REQUIRED = 'ONBOARDING_REQUIRED'
const onboardingListeners = new Set<() => void>()

/** Called whenever a service answers `403 ONBOARDING_REQUIRED`; returns the unsubscribe function. */
export function onOnboardingRequired(listener: () => void): () => void {
  onboardingListeners.add(listener)
  return () => onboardingListeners.delete(listener)
}

async function reportOnboardingRequired(res: Response): Promise<void> {
  if (res.status !== 403) return
  // a clone: the caller still reads the body
  const body = (await res.clone().json().catch(() => null)) as { code?: string } | null
  if (body?.code === ONBOARDING_REQUIRED) onboardingListeners.forEach((listener) => listener())
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken()
  let res = await fetch(path, withAuth(init, accessToken))
  if (needsAuth(res)) {
    res = await fetch(path, withAuth(init, await getAccessToken(accessToken)))
    if (needsAuth(res)) signInAgain()
  }
  await reportOnboardingRequired(res)
  return res
}
