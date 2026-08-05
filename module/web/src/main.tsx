import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import '@uliss/design-system/styles.css'
import './app.css'
import {AuthProvider} from './auth/AuthContext'
import {NotificationProvider} from './notifications/NotificationProvider'
import {App} from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
          <NotificationProvider>
              <App/>
          </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
