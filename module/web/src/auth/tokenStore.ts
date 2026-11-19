/**
 * Token storage for the thin frontend. The service delivers tokens as JSON
 * (`POST /user/oauth2/callback`), the SPA holds them here and attaches `Authorization: Bearer`.
 * Tokens live in localStorage, shared by every tab and kept across browser restarts; chat drafts, pending turns and the
 * tab's user mark stay per tab in sessionStorage.
 */
import {readJwtClaims} from './jwtClaims'

export type Tokens = {
  accessToken: string
  refreshToken: string | null
  /** epoch millis when the access token expires */
  expiresAt: number
  /** OIDC id token: the hint the auth server's end-session endpoint needs to sign the browser out */
  idToken?: string | null
}

const KEY = 'uliss.tokens'
const CHAT_STATE_PREFIX = 'uliss.chat-'
/** The user this tab signed in as and whose chat state it holds; not under the chat prefix it guards. */
const CHAT_OWNER_KEY = 'uliss.chatOwner'

/** Refresh a bit before the real expiry to absorb clock skew / in-flight latency. */
const EXPIRY_SKEW_MS = 30_000

function parseTokens(raw: string | null): Tokens | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return null
  }
}

export function getTokens(): Tokens | null {
  return parseTokens(localStorage.getItem(KEY))
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(KEY)
}

/**
 * Stores [fresh] only while the stored refresh token is still [expected], the one the refresh was made with: a sign-out
 * or another user's sign-in in another tab meanwhile must not be overwritten. Returns the tokens stored afterwards.
 */
export function replaceTokens(expected: string, fresh: Tokens): Tokens | null {
  const stored = getTokens()
  if (stored?.refreshToken !== expected) return stored
  setTokens(fresh)
  return fresh
}

/**
 * At start-up: whether there are tokens, marking this tab with their user. Chat state of another user (a tab restored
 * with its old sessionStorage after someone else signed in) goes first.
 */
export function adoptStoredTokens(): boolean {
  const tokens = getTokens()
  if (!tokens) return false
  markTabUser(subjectOf(tokens.accessToken))
  return true
}

/**
 * Calls [onOtherUser] when another tab stores tokens of a different user than this tab's; this tab's chat state goes
 * first. Returns the unsubscribe.
 */
export function onOtherUserSignedIn(onOtherUser: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key !== KEY || event.storageArea !== localStorage) return
    const user = subjectOf(parseTokens(event.newValue)?.accessToken)
    const owner = sessionStorage.getItem(CHAT_OWNER_KEY)
    if (!user || !owner || user === owner) return
    clearChatState()
    onOtherUser()
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

function markTabUser(user: string | null): void {
  const owner = sessionStorage.getItem(CHAT_OWNER_KEY)
  if (owner && owner !== user) clearChatState()
  if (user) sessionStorage.setItem(CHAT_OWNER_KEY, user)
}

/** An explicit sign-out: tokens and every chat draft and pending turn go, nothing is left for the next user. */
export function clearSession(): void {
  clearTokens()
  clearChatState()
}

/**
 * A session that ended on its own (refresh refused): the tokens go, the chat state stays marked with its user, so a
 * turn sent just before is sent after the sign-in. Without tokens (another tab removed them) the owner already marked
 * (or none) stays as it is; [claimChatState] decides at the sign-in.
 */
export function endSessionKeepingChatState(): void {
  const owner = subjectOf(getTokens()?.accessToken)
  clearTokens()
  if (owner) sessionStorage.setItem(CHAT_OWNER_KEY, owner)
}

/** After a sign-in: chat state left behind stays only when the same user signed in again; the tab is marked as theirs. */
export function claimChatState(tokens: Tokens): void {
  const owner = sessionStorage.getItem(CHAT_OWNER_KEY)
  const user = subjectOf(tokens.accessToken)
  if (!owner || owner !== user) clearChatState()
  if (user) sessionStorage.setItem(CHAT_OWNER_KEY, user)
}

function clearChatState(): void {
  sessionStorage.removeItem(CHAT_OWNER_KEY)
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)
    // every chat draft and pending turn belongs to the signed-in user, not to the next one in this tab
    if (key?.startsWith(CHAT_STATE_PREFIX)) {
      sessionStorage.removeItem(key)
    }
  }
}

function subjectOf(accessToken: string | undefined): string | null {
  const sub = readJwtClaims(accessToken)?.sub
  return typeof sub === 'string' && sub !== '' ? sub : null
}

export function isExpired(tokens: Tokens): boolean {
  return Date.now() >= tokens.expiresAt - EXPIRY_SKEW_MS
}
