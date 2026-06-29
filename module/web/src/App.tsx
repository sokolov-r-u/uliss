import { useEffect, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Home } from './pages/Home'
import { Callback } from './pages/Callback'
import { Shell } from './ui/Shell'

/** Gate: kicks off an OAuth2 redirect when there is no authenticated user. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, signIn } = useAuth()

  useEffect(() => {
    if (!loading && !user) void signIn()
  }, [loading, user, signIn])

  if (loading || !user) {
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
