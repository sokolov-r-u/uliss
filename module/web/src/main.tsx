import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {createBrowserRouter, RouterProvider} from 'react-router-dom'
import '@uliss/design-system/styles.css'
import './app.css'
import {AuthProvider} from './auth/AuthContext'
import {applyTheme, readTheme} from './ui/theme'
import {AppLocaleProvider} from './i18n/AppLocale'
import {applyLocale, effectiveLocale, readLocaleChoice} from './i18n/localeChoice'
import {App} from './App'

// Appearance (Settings › Appearance) is per-device — apply the stored choice before first paint.
applyTheme(readTheme())
// The language too: `<html lang>` before first paint, so `:lang()` rules hold from the start.
applyLocale(effectiveLocale(readLocaleChoice()))

// A data router (for `useBlocker`) around the app's own <Routes>: one catch-all route hands every path to them.
const router = createBrowserRouter([{
    path: '*',
    element: <AuthProvider><App/></AuthProvider>,
}])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLocaleProvider>
      <RouterProvider router={router}/>
    </AppLocaleProvider>
  </StrictMode>,
)
