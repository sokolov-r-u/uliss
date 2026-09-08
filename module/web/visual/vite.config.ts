import path from 'node:path'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const webRoot = path.resolve(import.meta.dirname, '..')

/** Dedicated test-only entry; production `vite.config.ts` keeps `index.html` as its sole input. */
export default defineConfig({
    root: webRoot,
    plugins: [react()],
    build: {
        outDir: path.resolve(webRoot, 'visual-dist'),
        emptyOutDir: true,
        rollupOptions: {input: path.resolve(webRoot, 'visual/index.html')},
    },
})
