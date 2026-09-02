import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import '@uliss/design-system/styles.css'
import '../src/app.css'
import '../src/ui/AppShell.css'
import '../src/chat/chat.css'
import './visual.css'
import {VisualHarness} from './VisualHarness'

const params = new URLSearchParams(location.search)
const root = document.documentElement
root.dataset.ground = params.get('ground') ?? 'obsidian'
root.dataset.accent = params.get('accent') ?? 'ochre'
root.dataset.read = params.get('read') ?? 'regular'

createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter><VisualHarness
    scenario={params.get('scenario') ?? 'notes-empty'}/></MemoryRouter></StrictMode>)
