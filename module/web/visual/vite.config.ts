import path from 'node:path'
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'

const webRoot = path.resolve(import.meta.dirname, '..')
const realApiClient = path.resolve(webRoot, 'src/auth/apiClient.ts')
const fakeApiClient = path.resolve(webRoot, 'visual/fakeApi.ts')

/** Routes every import of `src/auth/apiClient.ts` to the fixture-backed `visual/fakeApi.ts`. */
function fixtureApi(): Plugin {
    return {
        name: 'uliss-visual-fixture-api',
        enforce: 'pre',
        async resolveId(source, importer, options) {
            if (!importer || importer === fakeApiClient) return null
            const resolved = await this.resolve(source, importer, {...options, skipSelf: true})
            return resolved?.id === realApiClient ? fakeApiClient : null
        },
    }
}

/** Dedicated test-only entry; production `vite.config.ts` keeps `index.html` as its sole input. */
export default defineConfig({
    root: webRoot,
    plugins: [fixtureApi(), react()],
    build: {
        outDir: path.resolve(webRoot, 'visual-dist'),
        emptyOutDir: true,
        rollupOptions: {input: path.resolve(webRoot, 'visual/index.html')},
    },
})
