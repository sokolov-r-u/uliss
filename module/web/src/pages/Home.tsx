import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchMe } from '../api/users'
import { AuthRequiredError } from '../auth/apiClient'
import { Shell } from '../ui/Shell'

type MeState =
  | { status: 'loading' }
  | { status: 'ok'; body: string }
  | { status: 'error'; message: string }

/** Protected landing screen: pulls `/users/me` (via authFetch) and renders it in the shell. */
export function Home() {
  const { logout } = useAuth()
  const [me, setMe] = useState<MeState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setMe({ status: 'loading' })
    fetchMe()
      .then((body) => {
        if (active) setMe({ status: 'ok', body })
      })
      .catch((e: unknown) => {
        if (!active) return
        // authFetch already kicked off a login/refresh redirect — nothing to render.
        if (e instanceof AuthRequiredError) return
        setMe({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <Shell
      kicker="authenticated"
      actions={
        <button type="button" className="link-btn" onClick={() => void logout()}>
          sign out
        </button>
      }
    >
      {me.status === 'loading' && <p className="auth-muted">loading…</p>}
      {me.status === 'error' && <p className="auth-error">{me.message}</p>}
      {me.status === 'ok' && <p className="me-result">{me.body}</p>}
    </Shell>
  )
}
