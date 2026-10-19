import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

/** Two widths: the phone (drawer, one pane) and the desktop (rail, panels). */
const viewports = [
    {name: 'phone', width: 360, height: 748},
    {name: 'desktop', width: 1280, height: 800},
] as const

type Scenario = {
    name: string
    route: string
    query?: string
    only?: (typeof viewports)[number]['name']
    act?: (page: Page) => Promise<void>
}

const scenarios: Scenario[] = [
    {name: 'chats-empty', route: '/chats', query: 'data=empty'},
    {name: 'chats-list', route: '/chats'},
    {name: 'chat', route: '/chats/c1'},
    {name: 'notes-empty', route: '/notes', query: 'data=empty'},
    {name: 'notes-list', route: '/notes'},
    {
        name: 'notes-menu', route: '/notes',
        act: (page) => page.getByRole('button', {name: 'Actions for The empty room'}).click(),
    },
    {name: 'note', route: '/notes/n1'},
    {name: 'constellations-empty', route: '/constellations', query: 'data=empty'},
    {name: 'constellations-tree', route: '/constellations'},
    {
        name: 'constellations-branch', route: '/constellations',
        act: (page) => page.getByRole('button', {name: /^Music/}).click(),
    },
    {
        name: 'constellations-colour', route: '/constellations', only: 'desktop',
        act: async (page) => {
            await page.getByRole('button', {name: /^Music/}).click()
            await page.getByRole('button', {name: /^Jazz/}).click()
            await page.getByRole('button', {name: 'Change colour'}).click()
        },
    },
    {name: 'sky-empty', route: '/sky'},
    {name: 'updates-empty', route: '/updates'},
    {name: 'search-empty', route: '/search'},
    {name: 'settings', route: '/settings'},
    {name: 'settings-appearance', route: '/settings/appearance'},
    {name: 'onboarding-name', route: '/chats', query: 'onboarding=name'},
    {name: 'onboarding-profile', route: '/chats', query: 'onboarding=profile'},
    {
        name: 'drawer', route: '/chats', only: 'phone',
        act: (page) => page.getByRole('button', {name: 'Open navigation'}).click(),
    },
    {
        name: 'sidebar-collapsed', route: '/chats/c1', only: 'desktop',
        act: (page) => page.getByRole('button', {name: 'Collapse sidebar'}).click(),
    },
]

for (const viewport of viewports) {
    for (const scenario of scenarios) {
        if (scenario.only && scenario.only !== viewport.name) continue
        test(`${scenario.name} · ${viewport.name}`, async ({page}) => {
            await page.setViewportSize(viewport)
            await openRoute(page, scenario.route, scenario.query)
            await scenario.act?.(page)
            await expect(page).toHaveScreenshot(`${scenario.name}-${viewport.name}.png`, {animations: 'disabled'})
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

test('all appearance token combinations resolve without horizontal overflow', async ({page}) => {
    for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await openRoute(page, '/notes/n1')

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
    }
})

test('reduced motion snapshot', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'})
    await page.setViewportSize(viewports[0])
    await openRoute(page, '/chats', 'onboarding=name')
    await expect(page).toHaveScreenshot('reduced-motion.png', {animations: 'disabled'})
})
