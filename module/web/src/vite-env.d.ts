/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Service base URL — used only by vite.config to target the dev proxy. */
  readonly USER_SERVICE_URL?: string
  /** Service port — used only by vite.config to target the dev proxy. */
  readonly USER_SERVICE_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
