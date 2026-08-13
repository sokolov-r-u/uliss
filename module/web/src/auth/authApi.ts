/**
 * Thin client for the service-side `/user/oauth2/*` endpoints (provided by the `:security`
 * library, mounted under `/user` by the `user` app). The frontend never talks to the
 * Authorization Server directly — it only ever calls the service it is currently using. Paths
 * are relative: in dev they go through the Vite proxy (same-origin), in prod the frontend is
 * served behind the same origin as the services.
 */
import {clearTokens, setTokens, type Tokens} from './tokenStore'

const RETURN_TO_KEY = 'uliss.returnTo'

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
  sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.search)
  window.location.href = '/user/oauth2/login'
}

/** One-shot read of the saved pre-login route; falls back to home and never loops back to /callback. */
export function takeReturnTo(): string {
  const to = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  if (to && to.startsWith('/') && !to.startsWith('/callback')) return to
  return '/'
}

/** Exchange the authorization code for tokens. `credentials:'include'` sends the code_verifier cookie. */
export async function exchangeCode(code: string): Promise<Tokens> {
  const res = await fetch(`/user/oauth2/callback?code=${encodeURIComponent(code)}`, {
    method: 'POST',
    credentials: 'include',
  })
  return readTokens(res, 'token exchange')
}

export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const res = await fetch('/user/oauth2/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
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
