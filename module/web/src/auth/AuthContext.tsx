import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, getTokens } from './tokenStore'
import { login as startLogin, logout as revokeAndClear } from './authApi'
import { announceSignOut, onSignOutElsewhere } from './signOutBroadcast'

type AuthState = {
  /** Whether the SPA currently holds tokens. */
  isAuthenticated: boolean
  /** Full-page handoff to the service login flow. */
  login: () => void
  /** Revoke the refresh token (best-effort), drop local tokens and end the auth server session (full page). */
  logout: () => Promise<void>
  /** Re-read tokens from storage into React state (call after a successful code exchange). */
  syncFromStore: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getTokens() != null)

  const syncFromStore = useCallback(() => setIsAuthenticated(getTokens() != null), [])

  // The auth server keeps its own browser session after a revocation: the whole page goes to its end-session endpoint,
  // which comes back to /signed-out. React state is left alone so RequireAuth does not start a new login meanwhile.
  const logout = useCallback(async () => {
    const tokens = getTokens()
    const endSession = await revokeAndClear(tokens?.refreshToken ?? null, tokens?.idToken ?? null)
    clearSession()
    announceSignOut()
    window.location.assign(endSession ?? '/signed-out')
  }, [])

  // Signed out in another tab: this tab's tokens belong to the same user and go too.
  useEffect(() => onSignOutElsewhere(() => {
    if (getTokens() == null) return
    clearSession()
    window.location.assign('/signed-out')
  }), [])

  const value = useMemo<AuthState>(
    () => ({ isAuthenticated, login: startLogin, logout, syncFromStore }),
    [isAuthenticated, logout, syncFromStore],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
