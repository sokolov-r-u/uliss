import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// Each test runs in a fresh browser context, so the picker's IndexedDB starts without favorites and gets the
// starter set; the emoji data comes from the app's own assets.

async function openSummaryDialog(page: Page): Promise<Locator> {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = page.getByRole('dialog', {name: 'Create a summary note?'})
    await expect(dialog.getByRole('button', {name: 'Icon: none'})).toBeVisible()
    // the card slides in; measure it where it stays
    await dialog.evaluate((card) => Promise.all(card.getAnimations({subtree: true}).map((animation) => animation.finished)))
    return dialog
}

async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    return {
        x: Math.round(box?.x ?? 0), y: Math.round(box?.y ?? 0),
        width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0),
    }
}

function picker(page: Page): Locator {
    return page.getByRole('dialog', {name: 'Choose an icon'})
}

test('the summary icon is picked from favorites over the card, which keeps its place and size', async ({page}) => {
    const dialog = await openSummaryDialog(page)
    const card = await boxOf(dialog)

    await dialog.getByRole('button', {name: 'Icon: none'}).click()
    const panel = picker(page)
    const favorites = panel.getByRole('group', {name: 'Favorites'})
    await expect(favorites.getByRole('button')).toHaveCount(20)
    expect(await boxOf(panel)).toEqual(card)
    // the library's own single row of favorites is hidden behind ours
    await expect(panel.locator('emoji-picker').locator('.favorites')).toBeHidden()

    await favorites.getByRole('button', {name: 'saxophone'}).click()

    await expect(panel).toHaveCount(0)
    await expect(dialog.getByRole('button', {name: 'Icon: 🎷'})).toBeFocused()
    expect(await boxOf(dialog)).toEqual(card)
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await page.getByRole('link', {name: 'Notes'}).first().click()
    await expect(page.getByRole('button', {name: '🎷 Constraints and the small room'}).first()).toBeVisible()
})

test('Escape and the close button leave the summary icon as it was and keep the dialog open', async ({page}) => {
    const dialog = await openSummaryDialog(page)

    await dialog.getByRole('button', {name: 'Icon: none'}).click()
    await expect(picker(page).getByRole('group', {name: 'Favorites'}).getByRole('button')).toHaveCount(20)
    await page.keyboard.press('Escape')
    await expect(picker(page)).toHaveCount(0)
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', {name: 'Icon: none'}).click()
    await picker(page).getByRole('button', {name: 'Close the picker'}).click()
    await expect(picker(page)).toHaveCount(0)
    await expect(dialog.getByRole('button', {name: 'Icon: none'})).toBeFocused()
})

test('the edit form sets, changes and removes the icon, and the list keeps names aligned', async ({page}) => {
    await openRoute(page, '/notes/n1')
    await page.getByRole('button', {name: 'Edit note'}).click()

    await page.getByRole('button', {name: 'Icon: none'}).click()
    const panel = picker(page)
    // a dropdown under the square, fully inside the window
    const viewport = page.viewportSize()
    const box = await boxOf(panel)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport?.height ?? 0)
    await panel.getByRole('group', {name: 'Favorites'}).getByRole('button', {name: 'guitar'}).click()
    await page.getByRole('button', {name: 'Save'}).click()
    await expect(page.getByRole('heading', {name: '🎸 The empty room'})).toBeVisible()

    await page.getByRole('button', {name: 'Edit note'}).click()
    await page.getByRole('button', {name: 'Icon: 🎸'}).click()
    await picker(page).getByRole('group', {name: 'Favorites'}).getByRole('button', {name: 'saxophone'}).click()
    await page.getByRole('button', {name: 'Save'}).click()
    await expect(page.getByRole('heading', {name: '🎷 The empty room'})).toBeVisible()

    // within the app: a reload would reset the fixtures
    await page.getByRole('link', {name: 'Notes'}).first().click()
    const withIcon = page.getByRole('button', {name: '🎷 The empty room'}).locator('[data-note-icon]')
    const without = page.getByRole('button', {name: 'A grammar for mornings'}).locator('[data-note-icon]')
    const [a, b] = [await boxOf(withIcon.first()), await boxOf(without.first())]
    expect(a.x).toBe(b.x)
    expect(a.width).toBe(b.width)
    await expect(without.first()).toBeEmpty()
})

test('the edit form removes the icon', async ({page}) => {
    await openRoute(page, '/notes/n1')
    await page.getByRole('button', {name: 'Edit note'}).click()
    await page.getByRole('button', {name: 'Icon: none'}).click()
    await picker(page).getByRole('group', {name: 'Favorites'}).getByRole('button', {name: 'brain'}).click()
    await page.getByRole('button', {name: 'Save'}).click()
    await expect(page.getByRole('heading', {name: '🧠 The empty room'})).toBeVisible()

    await page.getByRole('button', {name: 'Edit note'}).click()
    await page.getByRole('button', {name: 'Icon: 🧠'}).click()
    await picker(page).getByRole('button', {name: 'Remove the icon'}).click()
    await expect(page.getByRole('button', {name: 'Icon: none'})).toBeVisible()
    await page.getByRole('button', {name: 'Save'}).click()

    await expect(page.getByRole('heading', {name: 'The empty room', exact: true})).toBeVisible()
})
