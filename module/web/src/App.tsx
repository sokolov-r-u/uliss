import { useEffect, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { getTokens } from './auth/tokenStore'
import { Home } from './pages/Home'
import { Callback } from './pages/Callback'
import { Shell } from './ui/Shell'

/** Gate: hands off to the service login flow (full-page) when there are no tokens. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, login } = useAuth()

  useEffect(() => {
    // Double-check storage so a transient state desync (e.g. right after code exchange)
    // never triggers a spurious full-page redirect.
    if (!isAuthenticated && getTokens() == null) login()
  }, [isAuthenticated, login])

  if (!isAuthenticated) {
    return (
      <Shell kicker="redirecting">
        <p className="auth-muted">χαῖρε · taking you to sign in…</p>
      </Shell>
    )
  }
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/callback" element={<Callback />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
