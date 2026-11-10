import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// Note n1 ("The empty room") gets this poster; the third-party host answers from the route below.
const POSTER = 'https://posters.example/room.jpg'
const GONE = 'https://posters.example/gone.jpg'

// A tall image with a mark near the top, where a default (centred) avatar would not reach.
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">'
    + '<rect width="600" height="900" fill="#1b2433"/><circle cx="300" cy="300" r="200" fill="#c8643c"/></svg>'

/** Avatars load at the lowest priority after the sky; the emulated browser in CI can take a while. */
const LOADED = {timeout: 15_000}

const sky = (page: Page) => page.getByRole('group', {name: 'Sky map'})
const room = (page: Page) => sky(page).getByRole('button', {name: 'The empty room'})

/** Opens the sky with n1's [poster]; records each poster request's Referer. */
async function openSky(page: Page, poster = POSTER) {
    const referers: (string | undefined)[] = []
    await page.route('https://posters.example/**', async (route) => {
        referers.push(await route.request().headerValue('referer') ?? undefined)
        if (route.request().url() === GONE) return route.fulfill({status: 404, body: 'gone'})
        return route.fulfill({status: 200, contentType: 'image/svg+xml', body: IMAGE})
    })
    await openRoute(page, '/sky', `poster=${encodeURIComponent(poster)}`)
    return referers
}

/** The star's centre once the sky has stopped moving. */
async function settledCentre(star: Locator) {
    let last = ''
    await expect.poll(async () => {
        const box = await star.locator('circle').first().boundingBox()
        const now = box ? `${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)}` : ''
        const still = now !== '' && now === last
        last = now
        return still
    }, {intervals: [400], timeout: 15_000}).toBe(true)
    return last
}

test('a note with a poster is a round avatar in the sky, loaded without a referrer', async ({page}) => {
    const referers = await openSky(page)

    await expect(room(page).locator('image')).toHaveAttribute('href', POSTER, LOADED)
    expect(referers.length).toBeGreaterThan(0)
    expect(referers.every((referer) => referer === undefined)).toBe(true)
    await expect(sky(page).locator('image')).toHaveCount(1)
})

test('Posters in the sky off draws the plain star again and leaves the layout where it was', async ({page}) => {
    await openSky(page)
    await expect(room(page).locator('image')).toHaveCount(1, LOADED)
    // the open sheet narrows the sky, which re-frames it: measure with the sheet already open
    await page.getByRole('button', {name: 'Sky settings'}).click()
    const sheet = page.getByRole('complementary', {name: 'Sky settings'})
    const before = await settledCentre(room(page))

    await sheet.getByRole('switch', {name: /Posters in the sky/}).click()
    await expect(sheet.getByRole('radiogroup', {name: 'Poster size'})).toHaveCount(0)

    await expect(room(page).locator('image')).toHaveCount(0)
    // a sky still settling may creep by a pixel; a re-heated layout moves it further
    const [x0, y0] = before.split(',').map(Number)
    const [x1, y1] = (await settledCentre(room(page))).split(',').map(Number)
    expect(Math.abs(x1 - x0)).toBeLessThanOrEqual(1)
    expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(1)
})

test('a poster that does not load stays a plain star', async ({page}) => {
    const referers = await openSky(page, GONE)

    await expect.poll(() => referers.length, LOADED).toBeGreaterThan(0)
    await expect(room(page)).toBeVisible()
    await expect(sky(page).locator('image')).toHaveCount(0)
})

test('the avatar shows the poster round, ringed and sized by Poster size', async ({page}) => {
    await openSky(page)
    const image = room(page).locator('image')
    await expect(image).toHaveCount(1, LOADED)
    await settledCentre(room(page))
    const avatar = room(page).locator('clipPath + circle')

    expect((await avatar.boundingBox())?.width).toBeCloseTo(20, 0)
    // the avatar sits at a sub-pixel spot over backdrop dots and lines that differ run to run; a lost image or ring
    // changes far more than this
    await expect(room(page).locator('g').first()).toHaveScreenshot('sky-poster-avatar-regular.png',
        {maxDiffPixelRatio: 0.2})

    await page.getByRole('button', {name: 'Sky settings'}).click()
    const sizes = page.getByRole('complementary', {name: 'Sky settings'}).getByRole('radiogroup', {name: 'Poster size'})
    await sizes.getByRole('radio', {name: 'Beacon'}).click()
    await expect.poll(async () => Math.round((await avatar.boundingBox())?.width ?? 0)).toBe(28)
})
