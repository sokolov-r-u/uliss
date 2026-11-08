import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

test('a new note is written from the Notes screen and opens once saved', async ({page}) => {
    await openRoute(page, '/notes')
    await page.getByRole('button', {name: 'New note'}).click()

    const save = page.getByRole('button', {name: 'Save'})
    await expect(save).toBeDisabled()
    await expect(page.getByRole('textbox', {name: 'Message'})).toHaveCount(0)
    await page.getByRole('textbox', {name: 'Title'}).fill('Written by hand')
    await page.getByRole('textbox', {name: 'Note text'}).click()
    await page.keyboard.type('A thought worth keeping.')
    await save.click()

    await expect(page.getByRole('heading', {name: 'Written by hand'})).toBeVisible()
    await expect(page.getByText('A thought worth keeping.')).toBeVisible()
    await page.getByRole('button', {name: 'Back'}).click()
    await expect(page.getByRole('button', {name: 'Written by hand'}).first()).toBeVisible()
})

// the harness runs a memory router, so the browser's own Back is covered by Vitest (NoteCreatePage.test.tsx)
test('leaving a written note by the header Back asks first and keeps the text when staying', async ({page}) => {
    await openRoute(page, '/notes')
    await page.getByRole('button', {name: 'New note'}).click()
    await page.getByRole('textbox', {name: 'Note text'}).click()
    await page.keyboard.type('Half a thought')

    await page.getByRole('button', {name: 'Back'}).click()
    const dialog = page.getByRole('dialog', {name: 'Discard this note?'})
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', {name: 'Keep editing'}).click()
    await expect(page.getByRole('textbox', {name: 'Note text'})).toContainText('Half a thought')

    await page.getByRole('link', {name: 'Chats'}).first().click()
    await page.getByRole('dialog', {name: 'Discard this note?'}).getByRole('button', {name: 'Discard'}).click()
    await expect(page.getByRole('button', {name: 'New chat'}).first()).toBeVisible()
})

test('an edit is held against the side navigation too', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()
    await page.getByRole('textbox', {name: 'Title'}).fill('Something else')

    await page.getByRole('link', {name: 'Chats'}).first().click()
    const dialog = page.getByRole('dialog', {name: 'Discard your edits?'})
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', {name: 'Keep editing'}).click()

    await expect(page.getByRole('textbox', {name: 'Title'})).toHaveValue('Something else')
})
