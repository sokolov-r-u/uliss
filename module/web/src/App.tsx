import {type ReactNode, useEffect} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {useAuth} from './auth/AuthContext'
import {getTokens} from './auth/tokenStore'
import {Callback} from './pages/Callback'
import {Shell} from './ui/Shell'
import {AppShell} from './ui/AppShell'
import {TbdPage} from './ui/TbdPage'
import {ChatListPage} from './chat/ChatListPage'
import {ChatPage} from './chat/ChatPage'
import {NotesPage} from './notes/NotesPage'
import {SkyPage} from './sky/SkyPage'
import {SearchPage} from './search/SearchPage'

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
          <p className="auth-muted">Taking you to sign in…</p>
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
              <AppShell/>
          </RequireAuth>
        }
      >
          <Route index element={<Navigate to="/chats" replace/>}/>
          <Route path="chats" element={<ChatListPage/>}/>
          <Route path="chats/:chatId" element={<ChatPage/>}/>
          <Route path="notes" element={<NotesPage/>}/>
          <Route path="search" element={<SearchPage/>}/>
          <Route
              path="constellations"
              element={
                  <TbdPage
                      kicker="constellations"
                      title="Constellations"
                      description="Your notes gathered into named branches you can expand, rename, and prune. Not built yet — there is no tagging backend."
                  />
              }
          />
          <Route path="sky" element={<SkyPage/>}/>
          <Route
              path="updates"
              element={
                  <TbdPage
                      kicker="updates"
                      title="Updates"
                      description="A log of everything Uliss did on its own — links it drew, summaries it wrote, patterns it noticed. Not built yet — nothing emits these yet."
                  />
              }
          />
          <Route path="*" element={<Navigate to="/chats" replace/>}/>
      </Route>
    </Routes>
  )
}
