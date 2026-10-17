import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

// Chromium's fake device answers getUserMedia with a test tone and grants access without a prompt.
test.use({
    launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']},
    permissions: ['microphone'],
})

test('Stop puts a dictation into the chat field and Send dictates straight into the chat', async ({page}) => {
    await openRoute(page, '/chats/c1')
    const field = page.getByRole('textbox', {name: 'Message'})
    await field.fill('Before')

    await page.getByRole('button', {name: 'Voice input'}).click()
    await expect(page.getByRole('status').filter({hasText: 'Recording'})).toContainText('/ 5:00')
    await page.getByRole('button', {name: 'Stop recording'}).click()
    await expect(field).toHaveValue('Before Dictated by voice')

    await field.fill('')
    await page.getByRole('button', {name: 'Voice input'}).click()
    await page.getByRole('button', {name: 'Send recording'}).click()
    await expect(page.getByText('Dictated by voice')).toBeVisible()
    await expect(page.getByRole('status').filter({hasText: 'searching notes…'})).toBeVisible()
})

test('a failed dictation is retried by hand with the same recording', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.evaluate(() => sessionStorage.setItem('visual.speech', 'fail-once'))

    await page.getByRole('button', {name: 'Voice input'}).click()
    await page.getByRole('button', {name: 'Stop recording'}).click()
    await expect(page.getByRole('alert')).toHaveText("Couldn't transcribe the recording")

    await page.getByRole('button', {name: 'Retry transcription'}).click()
    await expect(page.getByRole('textbox', {name: 'Message'})).toHaveValue('Dictated by voice')
    await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a dictated command rewrites the note being edited', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await page.getByRole('button', {name: 'Edit note'}).click()

    await page.getByRole('button', {name: 'Voice input'}).click()
    await page.getByRole('button', {name: 'Send recording'}).click()

    await expect(page.getByRole('heading', {name: 'Tidied'})).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
})
