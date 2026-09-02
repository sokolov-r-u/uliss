import {defineConfig} from '@playwright/test'

export default defineConfig({
    testDir: './visual/tests',
    outputDir: './visual/test-results',
    snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
    fullyParallel: true,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        colorScheme: 'dark',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run visual:serve',
        url: 'http://127.0.0.1:4173/visual/index.html',
        reuseExistingServer: false,
        timeout: 120_000,
    },
})
