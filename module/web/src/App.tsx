import {type ReactNode, useEffect} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {useAuth} from './auth/AuthContext'
import {getTokens} from './auth/tokenStore'
import {Callback} from './pages/Callback'
import {Shell} from './ui/Shell'
import {AppShell} from './ui/AppShell'
import {ChatListPage} from './chat/ChatListPage'
import {ChatPage} from './chat/ChatPage'
import {NotesPage} from './notes/NotesPage'
import {NoteDetailPage} from './notes/NoteDetailPage'
import {ConstellationsPage} from './constellations/ConstellationsPage'
import {SkyPage} from './sky/SkyPage'
import {UpdatesPage} from './updates/UpdatesPage'
import {SearchPage} from './search/SearchPage'
import {SettingsPage} from './settings/SettingsPage'
import {AppearanceSettings} from './settings/AppearanceSettings'
import {SkySettings} from './settings/SkySettings'
import {AccountSettings} from './settings/AccountSettings'
import {LanguageSettings} from './settings/LanguageSettings'

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
          <Route path="notes/:noteId" element={<NoteDetailPage/>}/>
          <Route path="search" element={<SearchPage/>}/>
          <Route path="constellations" element={<ConstellationsPage/>}/>
          <Route path="sky" element={<SkyPage/>}/>
          <Route path="updates" element={<UpdatesPage/>}/>
          <Route path="settings" element={<SettingsPage/>}/>
          <Route path="settings/appearance" element={<AppearanceSettings/>}/>
          <Route path="settings/sky" element={<SkySettings/>}/>
          <Route path="settings/account" element={<AccountSettings/>}/>
          <Route path="settings/language" element={<LanguageSettings/>}/>
          <Route path="*" element={<Navigate to="/chats" replace/>}/>
      </Route>
    </Routes>
  )
}
