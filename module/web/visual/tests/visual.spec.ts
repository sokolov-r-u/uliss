import {expect, test} from '@playwright/test'

const viewports = [
    {name: 'phone', width: 360, height: 748},
    {name: 'tablet', width: 834, height: 1112},
    {name: 'tablet-landscape', width: 1112, height: 834},
    {name: 'desktop', width: 1080, height: 700},
]

const scenarios = [
    'login', 'register', 'onboarding-name', 'onboarding-profile', 'onboarding-busy',
    'shell-drawer', 'shell-rail', 'shell-sidebar', 'shell-collapsed',
    'chats-empty', 'chats-list', 'chats-conversation',
    'notes-empty', 'notes-populated', 'notes-menu',
    'search-empty', 'search-populated',
    'constellations-empty', 'constellations-populated',
    'sky-empty', 'sky-populated', 'updates-empty', 'updates-populated',
    'settings-root', 'settings-appearance', 'settings-sky', 'settings-account', 'settings-language',
    'dialog',
]

for (const viewport of viewports) {
    for (const scenario of scenarios) {
        test(`${scenario} · ${viewport.name}`, async ({page}) => {
            await page.setViewportSize(viewport)
            await page.goto(`/visual/index.html?scenario=${scenario}`)
            await expect(page).toHaveScreenshot(`${scenario}-${viewport.name}.png`, {
                animations: 'disabled',
                fullPage: true
            })
        })
    }
}

const grounds = ['obsidian', 'void']
const accents = ['ochre', 'terracotta', 'patina', 'bone']
const reads = ['compact', 'regular', 'large', 'larger']

for (const ground of grounds) for (const accent of accents) for (const read of reads) {
    test(`theme ${ground} · ${accent} · ${read}`, async ({page}) => {
        await page.setViewportSize({width: 360, height: 748})
        await page.goto(`/visual/index.html?scenario=chats-conversation&ground=${ground}&accent=${accent}&read=${read}`)
        await expect(page).toHaveScreenshot(`theme-${ground}-${accent}-${read}.png`, {animations: 'disabled'})
    })
}

test('reduced motion snapshot', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'})
    await page.setViewportSize({width: 360, height: 748})
    await page.goto('/visual/index.html?scenario=onboarding-busy')
    await expect(page).toHaveScreenshot('reduced-motion.png', {animations: 'disabled'})
})
