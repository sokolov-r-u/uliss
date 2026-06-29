import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchMe, UnauthorizedError } from '../api/users'
import { Shell } from '../ui/Shell'

type MeState =
  | { status: 'loading' }
  | { status: 'ok'; body: string }
  | { status: 'error'; message: string }

/** Protected landing screen: pulls `/users/me` and renders it in the design-system shell. */
export function Home() {
  const { user, signIn, signOut } = useAuth()
  const [me, setMe] = useState<MeState>({ status: 'loading' })

  useEffect(() => {
    if (!user) return
    let active = true
    setMe({ status: 'loading' })
    fetchMe(user.access_token)
      .then((body) => {
        if (active) setMe({ status: 'ok', body })
      })
      .catch((e: unknown) => {
        if (!active) return
        if (e instanceof UnauthorizedError) {
          void signIn()
          return
        }
        setMe({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      active = false
    }
  }, [user, signIn])

  const profile = user?.profile
  const displayName = (profile?.name ?? profile?.preferred_username ?? profile?.sub) as string | undefined

  return (
    <Shell
      kicker="authenticated"
      actions={
        <button type="button" className="link-btn" onClick={() => void signOut()}>
          sign out
        </button>
      }
    >
      {displayName ? <p className="auth-muted">χαῖρε · {displayName}</p> : null}

      {me.status === 'loading' && <p className="auth-muted">loading…</p>}
      {me.status === 'error' && <p className="auth-error">{me.message}</p>}
      {me.status === 'ok' && <p className="me-result">{me.body}</p>}
    </Shell>
  )
}
