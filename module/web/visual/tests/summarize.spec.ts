import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const summaryDialog = (page: Page) => page.getByRole('dialog', {name: 'Create a summary note?'})

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
    await dialog.getByRole('button', {name: /^Music/}).click()
    await dialog.getByRole('button', {name: /^Jazz/}).click()
    await dialog.getByRole('button', {name: 'Summarize into Jazz'}).click()

    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')
    await expect(dialog).toHaveCount(0)

    await openConstellations(page)
    await expect(treeRow(page, 'Music')).toContainText('1')
    await treeRow(page, 'Music').click()
    await treeRow(page, 'Jazz').click()
    await expect(page.getByRole('complementary', {name: 'Sub-constellation'}))
        .toContainText('Constraints and the small room')
})

test('a summary skipped past the picker has no place', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    await summaryDialog(page).getByRole('button', {name: 'Skip for now'}).click()
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
    await dialog.getByRole('textbox', {name: 'Put the note in…'}).fill('Rock')
    await dialog.getByRole('button', {name: 'Create “Rock”'}).click()
    await dialog.getByRole('button', {name: 'Summarize into Rock'}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toBeVisible()

    await openConstellations(page)
    await expect(treeRow(page, 'Rock')).toContainText('1')
})

test('a chat that already has a note updates it without the picker', async ({page}) => {
    await openRoute(page, '/chats/c1', 'summary=old')
    await page.getByRole('button', {name: 'Summarize'}).click()

    const dialog = page.getByRole('dialog', {name: 'Update “The empty room”?'})
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', {name: 'Put the note in…'})).toHaveCount(0)
    await dialog.getByRole('button', {name: 'Update note'}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is updating the note')
})
