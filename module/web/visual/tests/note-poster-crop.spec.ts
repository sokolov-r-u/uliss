import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// The poster is a third-party https image the browser loads itself; here the "web" answers from these routes.
const POSTER = 'https://posters.example/tokyo-story.jpg'
const GONE = 'https://posters.example/gone.jpg'

// A wide image with a mark in each half, so a frame's position shows on the screenshots.
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">'
    + '<rect width="1200" height="800" fill="#1b2433"/><rect x="0" width="600" height="800" fill="#e8d3a8"/>'
    + '<circle cx="300" cy="400" r="160" fill="#c8643c"/><circle cx="900" cy="400" r="160" fill="#6c8cbf"/></svg>'

type Serving = 'image' | 'held'

/**
 * Opens the crop dialog of note n1's [poster]. [serving] says how the image is answered when the dialog asks for it;
 * until then the page gets it at once (`held` answers 404 meanwhile, so nothing cached spares the dialog's request
 * and the page still settles), and `release` serves the held image.
 */
async function openCrop(page: Page, poster = POSTER, serving: Serving = 'image') {
    let held = false
    let release: () => void = () => undefined
    const released = new Promise<void>((resolve) => {
        release = resolve
    })
    await page.route('https://posters.example/**', async (route) => {
        if (route.request().url() === GONE || (serving === 'held' && !held)) {
            return route.fulfill({status: 404, body: 'gone'})
        }
        if (held) await released
        return route.fulfill({status: 200, contentType: 'image/svg+xml', body: IMAGE})
    })
    await openRoute(page, '/notes/n1', `poster=${encodeURIComponent(poster)}`)
    const toggle = page.getByRole('button', {name: 'Note details'})
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
    const section = page.getByRole('region', {name: 'Poster'})
    if (serving === 'held') {
        await expect(section.getByText('Image unavailable')).toBeVisible()
        held = true
    }
    await section.getByRole('button', {name: 'Crop poster'}).click()
    return {dialog: page.getByRole('dialog', {name: 'Crop poster'}), release}
}

async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    return {width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0)}
}

test('a cropped poster is saved and the panel shows the frame', async ({page}) => {
    const {dialog} = await openCrop(page)
    await expect(dialog.getByRole('button', {name: 'Save'})).toBeEnabled()

    await dialog.getByRole('button', {name: 'Zoom in'}).click()
    await expect(dialog.getByText('115%')).toBeVisible()
    await dialog.getByRole('group', {name: /Panel frame 2:3/}).press('ArrowLeft')
    await dialog.getByRole('button', {name: 'Save'}).click()

    await expect(dialog).toBeHidden()
    const panel = page.getByRole('region', {name: 'Poster'}).getByRole('img', {name: /poster$/})
    const style = (name: 'width' | 'left') =>
        panel.evaluate((image, key) => parseFloat((image as HTMLElement).style[key]), name)
    // 1200 × 800: the 2:3 frame is 533 px wide at 100%, 464 px at 115%; the image is scaled to fill it
    const frame = 800 / 1.5 / 1.15
    await expect.poll(() => style('width')).toBeCloseTo(1200 / frame * 100, 0)
    // centred, then the image moved right by 8 screen px, so the frame starts left of the centre
    const centred = (600 - frame / 2) / frame * 100
    expect(-(await style('left'))).toBeLessThan(centred - 1)
})

test('the crop dialog keeps its size through loading, modes, zoom, reset, saving, a failed save and an unavailable image', async ({page}) => {
    // two page loads and every state of the dialog
    test.slow()
    const {dialog, release} = await openCrop(page, POSTER, 'held')
    await expect(dialog.getByText('Loading the image…')).toBeVisible()
    const size = await boxOf(dialog)
    release()
    await expect(dialog.getByRole('button', {name: 'Save'})).toBeEnabled()
    expect(await boxOf(dialog)).toEqual(size)

    await dialog.getByRole('radio', {name: 'Sky avatar'}).click()
    expect(await boxOf(dialog)).toEqual(size)
    await dialog.getByRole('button', {name: 'Zoom in'}).click()
    await expect(dialog.getByText('115%')).toBeVisible()
    expect(await boxOf(dialog)).toEqual(size)
    await dialog.getByRole('button', {name: 'Reset'}).click()
    await expect(dialog.getByText('100%')).toBeVisible()
    expect(await boxOf(dialog)).toEqual(size)

    await page.evaluate(() => sessionStorage.setItem('visual.poster', 'hold'))
    await dialog.getByRole('button', {name: 'Save'}).click()
    await expect(dialog.getByText('Saving…')).toBeVisible()
    await expect(dialog.getByRole('button', {name: 'Cancel'})).toBeDisabled()
    expect(await boxOf(dialog)).toEqual(size)
    await page.evaluate(() => sessionStorage.setItem('visual.poster', 'fail-once'))
    await expect(dialog.getByText('Couldn’t save the crop. Try again.')).toBeVisible()
    expect(await boxOf(dialog)).toEqual(size)
    await dialog.getByRole('button', {name: 'Cancel'}).click()

    const {dialog: gone} = await openCrop(page, GONE)
    await expect(gone.getByText('Image unavailable')).toBeVisible()
    await expect(gone.getByRole('button', {name: 'Save'})).toBeDisabled()
    expect(await boxOf(gone)).toEqual(size)
})

for (const viewport of [{name: 'desktop', width: 1280, height: 800}, {name: 'phone', width: 360, height: 748}]) {
    test(`the crop dialog on the ${viewport.name}`, async ({page}) => {
        await page.setViewportSize(viewport)
        const {dialog} = await openCrop(page)
        await expect(dialog.getByRole('button', {name: 'Save'})).toBeEnabled()
        const box = await dialog.boundingBox()
        // the whole dialog, its actions included, fits the screen
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height)
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width)

        await expect(page).toHaveScreenshot(`note-poster-crop-${viewport.name}.png`, {animations: 'disabled'})
    })
}
