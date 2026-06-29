import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
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
export default defineConfig({
  plugins: [react(), noStoreHtml()],
  // Read env from the shared infra/.env so all config lives in one file. Only VITE_*-prefixed
  // vars reach the browser bundle — backend secrets in the same file stay server-side.
  envDir: path.resolve(import.meta.dirname, '../../infra'),
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
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
})
