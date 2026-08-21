import {type ReactNode, useEffect} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {useAuth} from './auth/AuthContext'
import {getTokens} from './auth/tokenStore'
import {Callback} from './pages/Callback'
import {Shell} from './ui/Shell'
import {AppShell} from './ui/AppShell'
import {ChatListPage} from './chat/ChatListPage'
import {ChatPage} from './chat/ChatPage'
import {JournalPage} from './journal/JournalPage'
import {GraphPage} from './graph/GraphPage'

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
              <AppShell/>
          </RequireAuth>
        }
      >
          <Route index element={<Navigate to="/chats" replace/>}/>
          <Route path="chats" element={<ChatListPage/>}/>
          <Route path="chats/:chatId" element={<ChatPage/>}/>
          <Route path="journal" element={<JournalPage/>}/>
          <Route path="graph" element={<GraphPage/>}/>
          <Route path="*" element={<Navigate to="/chats" replace/>}/>
      </Route>
    </Routes>
  )
}
