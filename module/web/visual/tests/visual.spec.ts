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
    'notes-empty', 'notes-populated', 'notes-menu', 'notes-detail-ready',
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

const grounds = {
    obsidian: {bgDeep: '#0a0a0a', bgSurface: '#161616'},
    void: {bgDeep: '#020407', bgSurface: '#101010'},
} as const
const accents = {
    ochre: {accent: '#d99a4e', accent2: '#f0c06a'},
    terracotta: {accent: '#c8643c', accent2: '#d99a4e'},
    patina: {accent: '#5c8a72', accent2: '#8fae82'},
    bone: {accent: '#b9a888', accent2: '#e8d3a8'},
} as const
const reads = {
    compact: {size: '13px', leading: '1.58'},
    regular: {size: '14.5px', leading: '1.51'},
    large: {size: '16px', leading: '1.51'},
    larger: {size: '18px', leading: '1.45'},
} as const

const themeSmokeCases = [
    {ground: 'obsidian', accent: 'ochre', read: 'compact'},
    {ground: 'void', accent: 'terracotta', read: 'regular'},
    {ground: 'obsidian', accent: 'patina', read: 'large'},
    {ground: 'void', accent: 'bone', read: 'larger'},
] as const

for (const {ground, accent, read} of themeSmokeCases) {
    test(`theme smoke ${ground} · ${accent} · ${read}`, async ({page}) => {
        await page.setViewportSize({width: 360, height: 748})
        await page.goto(`/visual/index.html?scenario=notes-detail-ready&ground=${ground}&accent=${accent}&read=${read}`)
        await expect(page).toHaveScreenshot(`theme-smoke-${ground}-${accent}-${read}.png`, {animations: 'disabled'})
    })
}

test('all appearance token combinations resolve without horizontal overflow', async ({page}) => {
    await page.setViewportSize({width: 360, height: 748})
    await page.goto('/visual/index.html?scenario=notes-detail-ready')

    for (const [ground, expectedGround] of Object.entries(grounds)) {
        for (const [accent, expectedAccent] of Object.entries(accents)) {
            for (const [read, expectedRead] of Object.entries(reads)) {
                const actual = await page.evaluate(({ground, accent, read}) => {
                    const root = document.documentElement
                    root.dataset.ground = ground
                    root.dataset.accent = accent
                    root.dataset.read = read
                    const styles = getComputedStyle(root)
                    return {
                        bgDeep: styles.getPropertyValue('--bg-deep').trim(),
                        bgSurface: styles.getPropertyValue('--bg-surface').trim(),
                        accent: styles.getPropertyValue('--accent').trim(),
                        accent2: styles.getPropertyValue('--accent-2').trim(),
                        size: styles.getPropertyValue('--read-size').trim(),
                        leading: styles.getPropertyValue('--read-leading').trim(),
                        overflows: root.scrollWidth > root.clientWidth,
                    }
                }, {ground, accent, read})

                expect(actual).toEqual({...expectedGround, ...expectedAccent, ...expectedRead, overflows: false})
            }
        }
    }
})

test('reduced motion snapshot', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'})
    await page.setViewportSize({width: 360, height: 748})
    await page.goto('/visual/index.html?scenario=onboarding-busy')
    await expect(page).toHaveScreenshot('reduced-motion.png', {animations: 'disabled'})
})
