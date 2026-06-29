/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_AUTHORITY?: string
  readonly VITE_AUTH_CLIENT_ID?: string
  readonly VITE_AUTH_REDIRECT_URI?: string
  readonly VITE_AUTH_POST_LOGOUT_URI?: string
  readonly VITE_USER_SERVICE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
