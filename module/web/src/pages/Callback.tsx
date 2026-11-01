import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clearLoginRetry, exchangeCode, login, LoginRejectedError, retryLoginOnce, takeReturnTo } from '../auth/authApi'
import { useAuth } from '../auth/AuthContext'
import { claimChatState } from '../auth/tokenStore'
import { Shell } from '../ui/Shell'

/**
 * Landing page the Authorization Server redirects the browser to after login.
 * Takes the `code` and `state` from the query, exchanges them for tokens via the service, then
 * routes the user back to where they were.
 */
export function Callback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { syncFromStore } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    // Guard against StrictMode's double-invoke — the authorization code is single-use.
    if (ran.current) return
    ran.current = true
    // a shown error ends this login: the next manual attempt may be restarted once again
    const fail = (message: string) => {
      clearLoginRetry()
      setError(message)
    }

    // The authorization server reports a refused or cancelled login as `error=...` instead of a code.
    if (params.get('error')) {
      fail('Sign-in was cancelled or refused.')
      return
    }
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) {
      fail('The sign-in link is incomplete. Start sign-in again.')
      return
    }
    exchangeCode(code, state)
      .then((tokens) => {
        // before any screen mounts: a chat turn left by an expired session is sent only for its own user
        claimChatState(tokens)
        clearLoginRetry()
        syncFromStore()
        // marked so the first screen offers no Back into the OAuth redirects
        navigate(takeReturnTo(), { replace: true, state: { fromLogin: true } })
      })
      .catch((e: unknown) => {
        if (e instanceof LoginRejectedError) {
          if (retryLoginOnce()) return
          fail('The sign-in session has expired. Start sign-in again.')
          return
        }
        fail('Could not complete sign-in. Check the connection and try again.')
      })
  }, [params, navigate, syncFromStore])

  return (
    <Shell kicker={error ? 'authentication failed' : 'completing sign-in'}>
      {error ? (
        <>
          <p className="auth-error">{error}</p>
          <div className="panel-actions">
            {/* no "sign out" here: without tokens there is no id token, and the auth server will not end its session */}
            <button type="button" className="link-btn" onClick={() => login()}>
              try again
            </button>
          </div>
        </>
      ) : (
        <p className="auth-muted">χαῖρε · one moment…</p>
      )}
    </Shell>
  )
}
