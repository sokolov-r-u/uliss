import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from 'oidc-client-ts'
import { userManager } from './oidc'

type AuthState = {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    userManager
      .getUser()
      .then((u) => {
        if (active) setUser(u && !u.expired ? u : null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    // Keep React state in sync with silent renews / sign-outs.
    const onLoaded = (u: User) => setUser(u)
    const onUnloaded = () => setUser(null)
    userManager.events.addUserLoaded(onLoaded)
    userManager.events.addUserUnloaded(onUnloaded)
    userManager.events.addAccessTokenExpired(onUnloaded)

    return () => {
      active = false
      userManager.events.removeUserLoaded(onLoaded)
      userManager.events.removeUserUnloaded(onUnloaded)
      userManager.events.removeAccessTokenExpired(onUnloaded)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: () => userManager.signinRedirect(),
      signOut: async () => {
        await userManager.removeUser()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
