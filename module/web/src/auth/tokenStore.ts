/**
 * Token storage for the thin frontend. The service delivers tokens as JSON
 * (`POST /user/oauth2/callback`), the SPA holds them here and attaches `Authorization: Bearer`.
 * sessionStorage keeps the current convention (cleared when the tab closes).
 */

export type Tokens = {
  accessToken: string
  refreshToken: string | null
  /** epoch millis when the access token expires */
  expiresAt: number
  /** OIDC id token: the hint the auth server's end-session endpoint needs to sign the browser out */
  idToken?: string | null
}

const KEY = 'uliss.tokens'

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
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index)
        // every chat draft and pending turn belongs to the signed-in user, not to the next one in this tab
        if (key?.startsWith('uliss.chat-')) {
            sessionStorage.removeItem(key)
        }
    }
}

export function isExpired(tokens: Tokens): boolean {
  return Date.now() >= tokens.expiresAt - EXPIRY_SKEW_MS
}
