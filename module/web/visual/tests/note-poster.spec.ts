import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// Posters are third-party https images the browser loads itself; here the "web" answers from these routes.
const POSTER = 'https://posters.example/tokyo-story.jpg'
const OTHER = 'https://posters.example/dune.jpg'
const THUMB = 'https://posters.example/thumb.jpg'
const GONE = 'https://posters.example/gone.jpg'

function svg(width: number, height: number, fill: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<rect width="${width}" height="${height}" fill="${fill}"/></svg>`
}

async function serveImages(page: Page) {
    await page.route('https://posters.example/**', (route) => {
        const url = route.request().url()
        if (url === GONE) return route.fulfill({status: 404, body: 'gone'})
        const body = url === THUMB ? svg(120, 180, '#c8643c') : svg(600, 900, url === OTHER ? '#1b2433' : '#e8d3a8')
        return route.fulfill({status: 200, contentType: 'image/svg+xml', body})
    })
}

const notePanel = (page: Page) => page.getByRole('complementary', {name: 'This note'})
const posterSection = (page: Page) => notePanel(page).getByRole('region', {name: 'Poster'})

async function openNote(page: Page, query = '') {
    await serveImages(page)
    await openRoute(page, '/notes/n1', query)
    const toggle = page.getByRole('button', {name: 'Note details'})
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
    await expect(posterSection(page)).toBeVisible()
}

async function heightOf(locator: Locator): Promise<number> {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    return Math.round(box?.height ?? 0)
}

test('a poster is added from a pasted link, previewed as it will show and shown first in the panel', async ({page}) => {
    await openNote(page)
    const section = posterSection(page)

    await section.getByRole('button', {name: 'Add poster'}).click()
    await section.getByRole('textbox', {name: 'Image link'}).fill(POSTER)
    await expect(section.getByRole('status')).toHaveText(/600 × 900 px — shown exactly like this/)
    await section.getByRole('button', {name: 'Save'}).click()

    await expect(section.getByRole('img', {name: /poster$/})).toHaveAttribute('src', POSTER)
    await expect(section.getByRole('img', {name: /poster$/})).toHaveAttribute('referrerpolicy', 'no-referrer')
    await expect(section.getByRole('button', {name: 'Change poster'})).toBeVisible()
    // the poster is the panel's first section
    await expect(notePanel(page).locator('section.context-section').first()).toHaveAttribute('aria-label', 'Poster')
})

test('the poster editor keeps one height through hints, errors, loading and the preview', async ({page}) => {
    await openNote(page)
    const section = posterSection(page)
    await section.getByRole('button', {name: 'Add poster'}).click()
    const editor = section.locator('form')
    const field = section.getByRole('textbox', {name: 'Image link'})
    const height = await heightOf(editor)

    await field.fill('http://posters.example/tokyo-story.jpg')
    await expect(section.getByRole('alert')).toHaveText(/Only https:\/\/ links/)
    expect(await heightOf(editor)).toBe(height)

    await field.fill(THUMB)
    await expect(section.getByRole('alert')).toHaveText(/Too small: 120 × 180 px, needs at least 300 px/)
    expect(await heightOf(editor)).toBe(height)

    await field.fill(GONE)
    await expect(section.getByRole('alert')).toHaveText(/Couldn’t load the image/)
    expect(await heightOf(editor)).toBe(height)

    await field.fill(POSTER)
    await expect(section.getByRole('status')).toHaveText(/600 × 900 px/)
    await expect(section.getByRole('button', {name: 'Save'})).toBeEnabled()
    expect(await heightOf(editor)).toBe(height)
})

test('the pencil edits the link under the poster and the bin removes it after a confirmation', async ({page}) => {
    await openNote(page, `poster=${encodeURIComponent(POSTER)}`)
    const section = posterSection(page)
    await expect(section.getByRole('img', {name: /poster$/})).toHaveAttribute('src', POSTER)

    await section.getByRole('button', {name: 'Change poster'}).click()
    const field = section.getByRole('textbox', {name: 'Image link'})
    await expect(field).toHaveValue(POSTER)
    // the frame stays on top, the link field comes under it
    const frame = await section.locator('figure').boundingBox()
    const input = await field.boundingBox()
    expect((input?.y ?? 0)).toBeGreaterThan((frame?.y ?? 0) + (frame?.height ?? 0) - 1)
    await field.fill(OTHER)
    await expect(section.getByRole('status')).toHaveText(/600 × 900 px/)
    await section.getByRole('button', {name: 'Save'}).click()
    await expect(section.getByRole('img', {name: /poster$/})).toHaveAttribute('src', OTHER)

    await section.getByRole('button', {name: 'Remove poster'}).click()
    const dialog = page.getByRole('dialog', {name: 'Remove the poster?'})
    await dialog.getByRole('button', {name: 'Remove'}).click()
    await expect(section.getByRole('button', {name: 'Add poster'})).toBeVisible()
})

test('a saved poster that stopped loading shows as unavailable, with its site', async ({page}) => {
    await openNote(page, `poster=${encodeURIComponent(GONE)}`)
    const section = posterSection(page)

    await expect(section.getByText('Image unavailable')).toBeVisible()
    await expect(section.getByText('posters.example')).toBeVisible()
    await expect(section.getByRole('button', {name: 'Change poster'})).toBeVisible()
})

test('a collapsed poster section stays collapsed on the next note', async ({page}) => {
    await openNote(page, `poster=${encodeURIComponent(POSTER)}`)
    await posterSection(page).getByRole('button', {name: 'Poster', exact: true}).click()
    await expect(posterSection(page).getByRole('img')).toBeHidden()
    await expect(posterSection(page).getByRole('button', {name: 'Change poster'})).toHaveCount(0)

    await openRoute(page, '/notes/n2')
    const toggle = page.getByRole('button', {name: 'Note details'})
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
    await expect(posterSection(page).getByRole('button', {name: 'Poster', exact: true})).toHaveAttribute('aria-expanded', 'false')
})
