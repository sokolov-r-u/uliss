import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeCode, login, takeReturnTo } from '../auth/authApi'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../ui/Shell'

/**
 * Landing page the Authorization Server redirects the browser to after login.
 * Takes the `code` from the query, exchanges it for tokens via the service, then routes
 * the user back to where they were.
 */
export function Callback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { syncFromStore, logout } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    // Guard against StrictMode's double-invoke — the authorization code is single-use.
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    if (!code) {
      setError('missing authorization code')
      return
    }
    exchangeCode(code)
      .then(() => {
        syncFromStore()
        navigate(takeReturnTo(), { replace: true })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [params, navigate, syncFromStore])

  return (
    <Shell kicker={error ? 'authentication failed' : 'completing sign-in'}>
      {error ? (
        <>
          <p className="auth-error">{error}</p>
          <div className="panel-actions">
            <button type="button" className="link-btn" onClick={() => login()}>
              try again
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => void logout().then(() => login())}
            >
              sign out
            </button>
          </div>
        </>
      ) : (
        <p className="auth-muted">χαῖρε · one moment…</p>
      )}
    </Shell>
  )
}
