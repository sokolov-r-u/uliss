import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { userManager } from '../auth/oidc'
import { Shell } from '../ui/Shell'

/** Handles the OAuth2 redirect: exchanges the authorization code for tokens, then routes home. */
export function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [navigate])

  return (
    <Shell kicker={error ? 'authentication failed' : 'completing sign-in'}>
      {error ? <p className="auth-error">{error}</p> : <p className="auth-muted">χαῖρε · one moment…</p>}
    </Shell>
  )
}
