import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const summaryDialog = (page: Page) => page.getByRole('dialog', {name: 'Create a summary note?'})
/** The same dialog on its "Choose a place" step. */
const placeStep = (page: Page) => page.getByRole('dialog', {name: 'Choose a place'})

async function sizeOf(dialog: Locator) {
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    return {width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0)}
}

async function openConstellations(page: Page) {
    await page.getByRole('link', {name: 'Constellations'}).first().click()
    await expect(page.getByRole('list', {name: 'Constellations'})).toBeVisible()
}

const treeRow = (page: Page, name: string) => page.getByRole('list', {name: 'Constellations'})
    .getByRole('button', {name: new RegExp(`^${name}`)})

test('the first summary goes into the branch picked before it starts', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = summaryDialog(page)
    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    const step = placeStep(page)
    await step.getByRole('button', {name: /^Music/}).click()
    await step.getByRole('button', {name: /^Jazz/}).click()
    await step.getByRole('button', {name: 'Put in Jazz'}).click()
    await expect(dialog.getByRole('button', {name: 'Place: Music › Jazz'})).toBeFocused()
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()

    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')
    await expect(dialog).toHaveCount(0)

    await openConstellations(page)
    await expect(treeRow(page, 'Music')).toContainText('1')
    await treeRow(page, 'Music').click()
    await treeRow(page, 'Jazz').click()
    await expect(page.getByRole('complementary', {name: 'Sub-constellation'}))
        .toContainText('Constraints and the small room')
})

test('a summary with an empty place has none', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    await summaryDialog(page).getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await openConstellations(page)
    await treeRow(page, 'Without constellation').click()
    await expect(page.getByRole('complementary', {name: 'Without constellation'}))
        .toContainText('Constraints and the small room')
})

test('a constellation created in the picker takes the summary', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = summaryDialog(page)
    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    const step = placeStep(page)
    await step.getByRole('textbox', {name: 'Find a place…'}).fill('Rock')
    await step.getByRole('button', {name: 'Create “Rock”'}).click()
    await step.getByRole('button', {name: 'Put in Rock'}).click()
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toBeVisible()

    await openConstellations(page)
    await expect(treeRow(page, 'Rock')).toContainText('1')
})

test('a chat that already has a note updates it without the picker', async ({page}) => {
    await openRoute(page, '/chats/c1', 'summary=old')
    await page.getByRole('button', {name: 'Summarize'}).click()

    const dialog = page.getByRole('dialog', {name: 'Update “The empty room”?'})
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', {name: /^Place:/})).toHaveCount(0)
    await dialog.getByRole('button', {name: 'Update note'}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is updating the note')
})

test('choosing a place is a step of the same dialog: same size, Back and Escape return', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800})
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = summaryDialog(page)
    const initial = await sizeOf(dialog)

    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    const step = placeStep(page)
    await expect(step.getByRole('textbox', {name: 'Find a place…'})).toBeFocused()
    expect(await sizeOf(step)).toEqual(initial)

    await step.getByRole('button', {name: 'Back'}).click()
    await expect(dialog.getByRole('button', {name: 'Place: Choose a place'})).toBeFocused()
    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    // the first Escape steps back, the second closes the dialog without a note
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(await sizeOf(dialog)).toEqual(initial)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status', {name: 'Summary note'})).toHaveCount(0)
})

test('the place tree shows five rows inline and fills the step in the dialog', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800})
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    await summaryDialog(page).getByRole('button', {name: 'Place: Choose a place'}).click()
    const list = placeStep(page).getByRole('list')

    // the tree takes the room under the title, well past five rows
    const box = await list.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThan(5 * 45)
})

