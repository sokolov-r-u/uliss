/**
 * `getAccessToken` is the only owner of the session: it returns the stored access token or refreshes it,
 * with at most one refresh in flight per tab and, through a Web Lock, per browser. `authFetch` — the single entry point for calling the current
 * service's protected API — attaches that token as `Authorization: Bearer` and retries once with a new
 * token on 401 / auth-redirect. Paths are relative (Vite proxy in dev / same-origin gateway in prod).
 */
import {
  belongsToAnotherUser,
  endSessionKeepingChatState,
  getTokens,
  isExpired,
  replaceTokens,
  type Tokens,
} from './tokenStore'
import {login, RefreshFailedError, RefreshRejectedError, refreshTokens} from './authApi'
import {readJwtClaims} from './jwtClaims'

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
// with invalid_grant and send the user to sign-in. Within a tab callers share `refreshing`; across the tabs, which share
// the tokens, the refresh runs under a Web Lock.
let refreshing: Promise<Tokens> | null = null

const REFRESH_LOCK = 'uliss.token-refresh'

function signInAgain(): never {
  // the session ended on its own: a turn the user just sent survives the sign-in if the same user comes back
  endSessionKeepingChatState()
  login()
  throw new AuthRequiredError()
}

/**
 * Another user signed in in another tab: their tokens are not this tab's to use or to clear. The tab starts over and
 * its listener for that sign-in drops its chat state.
 */
function anotherUsersSession(): never {
  window.location.assign('/')
  throw new AuthRequiredError()
}

/** The tokens this tab may use: none when they are gone, and never those of another user. */
function tabTokens(): Tokens | null {
  const tokens = getTokens()
  if (tokens && belongsToAnotherUser(tokens)) anotherUsersSession()
  return tokens
}

/** Pause before repeating a refresh that failed on the network or server side. */
export const REFRESH_RETRY_DELAY_MS = 1_000

/**
 * A failed refresh may still have rotated the token on the auth server (its answer was lost); the auth server accepts
 * a repeat with the old token shortly after, so one retry recovers instead of showing an error. A timeout is repeated
 * too: the lock is then held for up to twice the refresh timeout, but a later refresh with that old token would be
 * taken for a stolen one and end the session.
 */
async function refreshWithRetry(refreshToken: string, idToken: string | null): Promise<Tokens> {
  try {
    return await refreshTokens(refreshToken, idToken)
  } catch (error) {
    if (!isWorthRepeating(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS))
    return refreshTokens(refreshToken, idToken)
  }
}

/** A network failure or a server error; a refused token or another client error would only fail again. */
function isWorthRepeating(error: unknown): boolean {
  if (error instanceof RefreshRejectedError) return false
  return !(error instanceof RefreshFailedError) || error.status >= 500
}

/** Runs [task] while no other tab of this browser refreshes; without Web Locks only this tab's refresh is shared. */
function underRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request(REFRESH_LOCK, task) : task()
}

/**
 * Refreshes unless another tab already did while this one waited for the lock: then its tokens are taken. [force]
 * always refreshes, for claims that changed on the server after the stored token was issued.
 */
function runRefresh(rejected: string | undefined, force: boolean): Promise<Tokens> {
  return underRefreshLock(async () => {
    const tokens = tabTokens()
    if (!tokens) signInAgain()
    if (!force && tokens.accessToken !== rejected && !isExpired(tokens)) return tokens
    if (!tokens.refreshToken) signInAgain()
    let rotated: Tokens
    try {
      rotated = await refreshWithRetry(tokens.refreshToken, tokens.idToken ?? null)
    } catch (error) {
      if (error instanceof RefreshRejectedError) signInAgain()
      throw new SessionRefreshError(error)
    }
    // a sign-out (or another user's sign-in) in another tab meanwhile wins over this refresh
    const stored = replaceTokens(tokens.refreshToken, rotated)
    if (!stored) signInAgain()
    if (belongsToAnotherUser(stored)) anotherUsersSession()
    return stored
  })
}

function refreshOnce(rejected: string | undefined, force = false): Promise<Tokens> {
  refreshing ??= runRefresh(rejected, force).finally(() => {
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
  const tokens = tabTokens()
  if (!tokens) signInAgain()
  if (tokens.accessToken !== rejected && !isExpired(tokens)) return tokens.accessToken
  return (await refreshOnce(rejected)).accessToken
}

/**
 * Replaces the access token even while it is still valid, so claims that changed on the server reach the services
 * (e.g. `onboardingRequired` disappears once the last blocking onboarding step is done).
 */
export async function refreshSession(): Promise<void> {
  // a refresh already in flight may have been issued before the server-side change
  while (refreshing) await refreshing.catch(() => undefined)
  await refreshOnce(undefined, true)
}

/** Whether the current access token says blocking onboarding is pending; the services enforce it either way. */
export function tokenRequiresOnboarding(): boolean {
  return readJwtClaims(getTokens()?.accessToken)?.onboardingRequired === true
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
