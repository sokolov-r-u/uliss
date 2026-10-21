import {lazy, type ReactNode, Suspense, useEffect} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {useAuth} from './auth/AuthContext'
import {getTokens} from './auth/tokenStore'
import {Callback} from './pages/Callback'
import {SignedOut} from './pages/SignedOut'
import {Shell} from './ui/Shell'
import {AppShell} from './ui/AppShell'
import {ChatListPage} from './chat/ChatListPage'
import {ChatPage} from './chat/ChatPage'
import {NotesPage} from './notes/NotesPage'
import {UpdatesPage} from './updates/UpdatesPage'
import {SearchPage} from './search/SearchPage'
import {SettingsPage} from './settings/SettingsPage'
import {AppearanceSettings} from './settings/AppearanceSettings'
import {SkySettings} from './settings/SkySettings'
import {AccountSettings} from './settings/AccountSettings'
import {LanguageSettings} from './settings/LanguageSettings'

// The heaviest screens (the editor, the tree, the sky renderer) load on first visit, not with the first page.
const NoteDetailPage = lazy(() => import('./notes/NoteDetailPage').then((m) => ({default: m.NoteDetailPage})))
const ConstellationsPage = lazy(() =>
    import('./constellations/ConstellationsPage').then((m) => ({default: m.ConstellationsPage})))
const SkyPage = lazy(() => import('./sky/SkyPage').then((m) => ({default: m.SkyPage})))

function Loading() {
    return <p className="auth-muted" aria-live="polite">Loading…</p>
}

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
      <Route path="/signed-out" element={<SignedOut />} />
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
          <Route path="chats/new" element={<ChatPage newChat/>}/>
          <Route path="chats/:chatId" element={<ChatPage/>}/>
          <Route path="notes" element={<NotesPage/>}/>
          <Route path="notes/:noteId" element={<Suspense fallback={<Loading/>}><NoteDetailPage/></Suspense>}/>
          <Route path="search" element={<SearchPage/>}/>
          <Route path="constellations" element={<Suspense fallback={<Loading/>}><ConstellationsPage/></Suspense>}/>
          <Route path="sky" element={<Suspense fallback={<Loading/>}><SkyPage/></Suspense>}/>
          <Route path="updates" element={<UpdatesPage/>}/>
          <Route path="settings" element={<SettingsPage/>}>
              <Route index element={<AppearanceSettings/>}/>
              <Route path="appearance" element={<AppearanceSettings/>}/>
              <Route path="sky" element={<SkySettings/>}/>
              <Route path="account" element={<AccountSettings/>}/>
              <Route path="language" element={<LanguageSettings/>}/>
          </Route>
          <Route path="*" element={<Navigate to="/chats" replace/>}/>
      </Route>
    </Routes>
  )
}
