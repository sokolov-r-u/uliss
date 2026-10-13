import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import '@uliss/design-system/styles.css'
import '../src/app.css'
import '../src/ui/AppShell.css'
import '../src/chat/chat.css'
import './visual.css'
import {App} from '../src/App'
import {AuthProvider} from '../src/auth/AuthContext'
import {setTokens} from '../src/auth/tokenStore'
import {NotificationProvider} from '../src/notifications/NotificationProvider'
import {VisualHarness} from './VisualHarness'

const params = new URLSearchParams(location.search)
const root = document.documentElement
root.dataset.ground = params.get('ground') ?? 'obsidian'
root.dataset.accent = params.get('accent') ?? 'ochre'
root.dataset.read = params.get('read') ?? 'regular'

// `?route=/chats` renders the real app on that route; API calls answer from fixtures (visual/fakeApi.ts).
const route = params.get('route')
if (route) setTokens({accessToken: 'visual', refreshToken: null, expiresAt: Date.now() + 3_600_000})

createRoot(document.getElementById('root')!).render(<StrictMode>
    {route
        ? <MemoryRouter initialEntries={[route]}><AuthProvider><NotificationProvider><App/></NotificationProvider>
        </AuthProvider></MemoryRouter>
        : <MemoryRouter><VisualHarness scenario={params.get('scenario') ?? 'dialog'}/></MemoryRouter>}
</StrictMode>)
