import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adoptStoredTokens, clearSession, clearTabChatState, getTokens, onOtherUserSignedIn } from './tokenStore'
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
  // Before any screen mounts, a tab restored with another user's chat state drops it. On /callback the sign-in decides
  // (`claimChatState`): the stored tokens may be another user's while this tab comes back as its own.
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    window.location.pathname.startsWith('/callback') ? getTokens() != null : adoptStoredTokens())
  // read by the sign-out listener, which outlives renders
  const signedIn = useRef(isAuthenticated)
  useEffect(() => {
    signedIn.current = isAuthenticated
  }, [isAuthenticated])

  const syncFromStore = useCallback(() => setIsAuthenticated(getTokens() != null), [])

  // The auth server keeps its own browser session after a revocation: the whole page goes to its end-session endpoint,
  // which comes back to /signed-out. React state is left alone so RequireAuth does not start a new login meanwhile.
  // The other tabs hear first, so none of them starts a silent sign-in while this one revokes.
  const logout = useCallback(async () => {
    const tokens = getTokens()
    announceSignOut()
    const endSession = await revokeAndClear(tokens?.refreshToken ?? null, tokens?.idToken ?? null)
    clearSession()
    window.location.assign(endSession ?? '/signed-out')
  }, [])

  // Signed out in another tab: that tab removes the shared tokens, so a late message (a frozen tab resuming after a new
  // sign-in) cannot wipe a newer session. This tab drops its chat state, including what a session that ended on its own
  // kept for that user's return, and leaves if it was signed in itself.
  useEffect(() => onSignOutElsewhere(() => {
    clearTabChatState()
    if (signedIn.current) window.location.assign('/signed-out')
  }), [])

  // Another user signed in in another tab: this tab's screens and chat state belong to the previous one.
  useEffect(() => onOtherUserSignedIn(() => window.location.assign('/')), [])

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
