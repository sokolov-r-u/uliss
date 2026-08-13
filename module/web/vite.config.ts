import path from 'node:path'
import {defineConfig, loadEnv, type Plugin, type ProxyOptions} from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Sends `Cache-Control: no-store` for the HTML entry document so that Safari (and
 * any other browser) always re-fetches index.html and therefore always picks up the
 * freshly-hashed asset bundles. Hashed assets under /assets/* stay immutable.
 *
 * Applied to both the dev server and `vite preview` (prod-like) middleware stacks.
 */
function noStoreHtml(): Plugin {
  const isHtmlEntry = (url?: string) => {
    if (!url) return false
    const path = url.split('?')[0]
    return path === '/' || path.endsWith('.html')
  }
  const apply = (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      if (isHtmlEntry(req.url)) {
        // Vite's own HTML/static middleware runs after us and would otherwise set
        // `Cache-Control: no-cache`. Intercept setHeader so the final value is `no-store`.
        const original = res.setHeader.bind(res)
        res.setHeader = (name: string, value: unknown) =>
          name.toLowerCase() === 'cache-control'
            ? original('Cache-Control', 'no-store, max-age=0')
            : original(name, value as never)
        res.setHeader('Cache-Control', 'no-store, max-age=0')
      }
      next()
    })
  }
  return {
    name: 'uliss-no-store-html',
    configureServer: apply,
    configurePreviewServer: apply,
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read env from the shared infra/.env so all config lives in one file. Only VITE_*-prefixed
  // vars reach the browser bundle — backend secrets in the same file stay server-side.
  const envDir = path.resolve(import.meta.dirname, '../../infra')
  const env = loadEnv(mode, envDir, '')
  const userServiceTarget = `${env.USER_SERVICE_URL ?? 'http://localhost'}:${env.USER_SERVICE_PORT ?? '8080'}`
  const noteServiceTarget = `${env.NOTE_SERVICE_URL ?? 'http://localhost'}:${env.NOTE_SERVICE_PORT ?? '8081'}`

  // Proxy the service auth/API paths so the browser talks to the service same-origin (:3000).
  // This keeps the code_verifier / session cookies first-party and avoids CORS in dev. Each
  // service's whole path space starts with its own name (/user, /note — WebMvcPathPrefixConfig
  // on the backend), so one proxy entry per service covers all of its routes.
  const proxy: Record<string, ProxyOptions> = {
    '/user': {target: userServiceTarget, changeOrigin: true},
    '/note': {target: noteServiceTarget, changeOrigin: true},
  }

  return {
    plugins: [react(), noStoreHtml()],
    envDir,
    server: {
      port: 3000,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 3000,
      strictPort: true,
      proxy,
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },
  }
})
