/**
 * Token storage for the thin frontend. The service delivers tokens as JSON
 * (`POST /user/oauth2/callback`), the SPA holds them here and attaches `Authorization: Bearer`.
 * sessionStorage keeps the current convention (cleared when the tab closes).
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
/** The user whose chat state survived a session that ended on its own; not under the chat prefix it guards. */
const CHAT_OWNER_KEY = 'uliss.chatOwner'

/** Refresh a bit before the real expiry to absorb clock skew / in-flight latency. */
const EXPIRY_SKEW_MS = 30_000

export function getTokens(): Tokens | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return null
  }
}

export function setTokens(tokens: Tokens): void {
  sessionStorage.setItem(KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  sessionStorage.removeItem(KEY)
}

/** An explicit sign-out: tokens and every chat draft and pending turn go, nothing is left for the next user. */
export function clearSession(): void {
  clearTokens()
  clearChatState()
}

/**
 * A session that ended on its own (refresh refused): the tokens go, the chat state stays marked with its user, so a
 * turn sent just before is sent after the sign-in. Without tokens the owner already marked (or none) stays as it is;
 * [claimChatState] decides at the sign-in.
 */
export function endSessionKeepingChatState(): void {
  const owner = subjectOf(getTokens()?.accessToken)
  clearTokens()
  if (owner) sessionStorage.setItem(CHAT_OWNER_KEY, owner)
}

/** After a sign-in: chat state left behind stays only when the same user signed in again. */
export function claimChatState(tokens: Tokens): void {
  const owner = sessionStorage.getItem(CHAT_OWNER_KEY)
  if (!owner || owner !== subjectOf(tokens.accessToken)) clearChatState()
  sessionStorage.removeItem(CHAT_OWNER_KEY)
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
