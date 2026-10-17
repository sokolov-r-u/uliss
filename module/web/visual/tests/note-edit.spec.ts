import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

test('a note is edited in place: formatting, the original, and save', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()

    const text = page.getByRole('textbox', {name: 'Note text'})
    await expect(text).toContainText('If the first hour is ritual')
    await expect(page.getByRole('button', {name: 'Save'})).toBeDisabled()

    await text.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' And the evening its close.')
    await page.getByRole('button', {name: 'Bulleted list'}).click()

    await page.getByRole('button', {name: 'Original'}).click()
    const original = page.getByRole('region', {name: 'Original note'})
    await expect(original).toContainText('If the first hour is ritual')
    await expect(original).not.toContainText('the evening')
    await page.getByRole('button', {name: 'Original'}).click()
    await expect(text).toContainText('And the evening its close.')

    await page.getByRole('textbox', {name: 'Title'}).fill('Mornings and evenings')
    await page.getByRole('button', {name: 'Save'}).click()

    await expect(page.getByRole('heading', {name: 'Mornings and evenings'})).toBeVisible()
    await expect(page.getByRole('listitem')).toContainText('And the evening its close.')
    await expect(page.getByRole('textbox', {name: 'Note text'})).toHaveCount(0)
})

test('cancelling an edit asks first and keeps the saved note', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()
    await page.getByRole('textbox', {name: 'Title'}).fill('Something else')

    await page.getByRole('button', {name: 'Cancel'}).click()
    await page.getByRole('dialog', {name: 'Discard your edits?'}).getByRole('button', {name: 'Discard'}).click()

    await expect(page.getByRole('heading', {name: 'A grammar for mornings'})).toBeVisible()
    await expect(page.getByText('If the first hour is ritual, the day has a spine to hang on.')).toBeVisible()
})

test('a command to Uliss rewrites the text as one undo step that is saved with Save', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()
    const text = page.getByRole('textbox', {name: 'Note text'})
    await expect(text).toContainText('If the first hour is ritual')

    const command = page.getByRole('textbox', {name: 'Message'})
    await expect(command).toHaveAttribute('placeholder', /…$/)
    await command.fill('Add a heading')
    await command.press('Enter')

    await expect(page.getByRole('heading', {name: 'Tidied'})).toBeVisible()
    await expect(command).toHaveValue('')
    await page.getByRole('button', {name: 'Undo'}).click()
    await expect(page.getByRole('heading', {name: 'Tidied'})).toHaveCount(0)
    await page.getByRole('button', {name: 'Redo'}).click()
    await expect(page.getByRole('heading', {name: 'Tidied'})).toBeVisible()

    await page.getByRole('button', {name: 'Save'}).click()
    await expect(page.getByRole('textbox', {name: 'Note text'})).toHaveCount(0)
    await expect(page.getByRole('heading', {name: 'Tidied'})).toBeVisible()
})

test('on a phone the command field and Save stay on screen under a long note', async ({page}) => {
    await page.setViewportSize({width: 375, height: 667})
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()

    await expect(page.getByRole('textbox', {name: 'Message'})).toBeInViewport()
    await expect(page.getByRole('button', {name: 'Save'})).toBeInViewport()
})
