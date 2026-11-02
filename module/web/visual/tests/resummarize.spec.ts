import {expect, type Locator, test} from '@playwright/test'
import {openRoute} from './routes'

/** Width and height only: the card slides in when it opens, so its position settles later. */
async function sizeOf(dialog: Locator) {
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    return {width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0)}
}

test('Summarize again rewrites a chat note after a confirmation and keeps its title', async ({page}) => {
    await openRoute(page, '/notes/n2', 'links=on&flags=resummarize')

    await page.getByRole('button', {name: 'Actions for A grammar for mornings'}).click()
    await page.getByRole('menuitem', {name: 'Summarize again'}).click()
    const dialog = page.getByRole('dialog', {name: 'Summarize this note again?'})
    await expect(dialog).toContainText('Your edits and additions are replaced')
    await dialog.getByRole('button', {name: 'Summarize'}).click()

    await expect(page.getByText('Written again from the whole chat.')).toBeVisible()
    await expect(page.getByRole('heading', {name: 'A grammar for mornings'})).toBeVisible()
    await expect(dialog).toHaveCount(0)
})

test('a refused Summarize again explains why in a dialog of the same size', async ({page}) => {
    await openRoute(page, '/notes/n2', 'links=on&flags=resummarize&resummarize=busy')
    await page.getByRole('button', {name: 'Actions for A grammar for mornings'}).click()
    await page.getByRole('menuitem', {name: 'Summarize again'}).click()
    const dialog = page.getByRole('dialog', {name: 'Summarize this note again?'})
    const before = await sizeOf(dialog)

    await dialog.getByRole('button', {name: 'Summarize'}).click()

    await expect(dialog).toContainText('Uliss is already writing a note from this chat.')
    expect(await sizeOf(dialog)).toEqual(before)
    await expect(page.getByText('If the first hour is ritual, the day has a spine to hang on.')).toBeVisible()
})

test('Summarize again is not offered while the flag is off', async ({page}) => {
    await openRoute(page, '/notes/n2', 'links=on')

    await page.getByRole('button', {name: 'Actions for A grammar for mornings'}).click()

    await expect(page.getByRole('menuitem', {name: 'Delete'})).toBeVisible()
    await expect(page.getByRole('menuitem', {name: 'Summarize again'})).toHaveCount(0)
})
