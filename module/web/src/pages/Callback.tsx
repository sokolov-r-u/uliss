import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clearLoginRetry, exchangeCode, login, LoginRejectedError, retryLoginOnce, takeReturnTo } from '../auth/authApi'
import { useAuth } from '../auth/AuthContext'
import { claimChatState } from '../auth/tokenStore'
import { Shell } from '../ui/Shell'
import { useMessages } from '@uliss/design-system'
import { authPagesMessages, type CallbackFailure } from './authPages.messages'

/**
 * Landing page the Authorization Server redirects the browser to after login.
 * Takes the `code` and `state` from the query, exchanges them for tokens via the service, then
 * routes the user back to where they were.
 */
export function Callback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { syncFromStore } = useAuth()
  const t = useMessages(authPagesMessages)
  // kept as a key: the text follows the interface language
  const [error, setError] = useState<CallbackFailure | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    // Guard against StrictMode's double-invoke — the authorization code is single-use.
    if (ran.current) return
    ran.current = true
    // a shown error ends this login: the next manual attempt may be restarted once again
    const fail = (failure: CallbackFailure) => {
      clearLoginRetry()
      setError(failure)
    }

    // The authorization server reports a refused or cancelled login as `error=...` instead of a code.
    if (params.get('error')) {
      fail('cancelled')
      return
    }
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) {
      fail('incomplete')
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
          fail('expired')
          return
        }
        fail('failed')
      })
  }, [params, navigate, syncFromStore])

  return (
    <Shell kicker={error ? t.authFailed : t.completing}>
      {error ? (
        <>
          <p className="auth-error">{t[error]}</p>
          <div className="panel-actions">
            {/* no "sign out" here: without tokens there is no id token, and the auth server will not end its session */}
            <button type="button" className="link-btn" onClick={() => login()}>
              {t.tryAgain}
            </button>
          </div>
        </>
      ) : (
        <p className="auth-muted">{t.oneMoment}</p>
      )}
    </Shell>
  )
}
