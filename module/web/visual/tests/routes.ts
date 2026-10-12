import type {Page} from '@playwright/test'

/** Fixtures are dated around this instant (visual/fixtures.ts); freezing it keeps Today / Yesterday stable. */
const NOW = new Date('2026-06-24T12:00:00Z')

/** Opens the real app on `route`; its API answers from fixtures (visual/fakeApi.ts). */
export async function openRoute(page: Page, route: string, query = '') {
    await page.clock.setFixedTime(NOW)
    await page.goto(`/visual/index.html?route=${encodeURIComponent(route)}${query ? `&${query}` : ''}`)
    await page.waitForLoadState('networkidle')
}
