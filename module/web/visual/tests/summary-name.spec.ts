import {expect, type Locator, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// Chromium's fake device answers getUserMedia with a test tone and grants access without a prompt.
test.use({
    launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']},
    permissions: ['microphone'],
})

async function openSummaryDialog(page: Page): Promise<Locator> {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = page.getByRole('dialog', {name: 'Create a summary note?'})
    await expect(dialog.getByRole('button', {name: 'Place: Choose a place'})).toBeVisible()
    return dialog
}

async function sizeOf(dialog: Locator) {
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    return {width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0)}
}

test('a named summary keeps the name the user typed', async ({page}) => {
    const dialog = await openSummaryDialog(page)
    await dialog.getByRole('textbox', {name: 'Name'}).fill('Giant Steps')
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await page.getByRole('link', {name: 'Notes'}).first().click()
    await expect(page.getByText('Giant Steps')).toBeVisible()
})

test('a name over the limit holds the summary and the dialog keeps its size', async ({page}) => {
    const dialog = await openSummaryDialog(page)
    const name = dialog.getByRole('textbox', {name: 'Name'})
    const summarize = dialog.getByRole('button', {name: 'Summarize', exact: true})
    const initial = await sizeOf(dialog)

    await name.fill('x'.repeat(51))
    await expect(dialog.getByText('51/50')).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveText('Shorten the name to 50 characters.')
    await expect(summarize).toBeDisabled()
    expect(await sizeOf(dialog)).toEqual(initial)

    await name.fill('x'.repeat(50))
    await expect(summarize).toBeEnabled()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    expect(await sizeOf(dialog)).toEqual(initial)
})

test('the name is dictated for at most 30 seconds without the dialog changing size', async ({page}) => {
    const dialog = await openSummaryDialog(page)
    const name = dialog.getByRole('textbox', {name: 'Name'})
    const initial = await sizeOf(dialog)

    await dialog.getByRole('button', {name: 'Dictate the name'}).click()
    await expect(dialog.getByRole('status').filter({hasText: 'Recording'})).toContainText('/ 0:30')
    await expect(dialog.getByRole('button', {name: 'Summarize', exact: true})).toBeDisabled()
    expect(await sizeOf(dialog)).toEqual(initial)

    await dialog.getByRole('button', {name: 'Stop recording'}).click()
    await expect(name).toHaveValue('Dictated by voice')
    expect(await sizeOf(dialog)).toEqual(initial)
})

test('a long dictated name is never cut and the dialog keeps its size', async ({page}) => {
    const dialog = await openSummaryDialog(page)
    const initial = await sizeOf(dialog)
    await page.evaluate(() => sessionStorage.setItem('visual.speech', 'long'))

    await dialog.getByRole('button', {name: 'Dictate the name'}).click()
    await dialog.getByRole('button', {name: 'Stop recording'}).click()

    await expect(dialog.getByRole('textbox', {name: 'Name'}))
        .toHaveValue('A dictated name that runs on well past the fifty character limit')
    await expect(dialog.getByRole('alert')).toHaveText('Shorten the name to 50 characters.')
    expect(await sizeOf(dialog)).toEqual(initial)
})

test('an update keeps its size when the request fails', async ({page}) => {
    await openRoute(page, '/chats/c1', 'summary=old')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = page.getByRole('dialog', {name: 'Update “The empty room”?'})
    const initial = await sizeOf(dialog)
    await page.evaluate(() => sessionStorage.setItem('visual.summary', 'fail-once'))

    await dialog.getByRole('button', {name: 'Update note'}).click()

    await expect(dialog.getByText('Something went wrong on our side. Try again in a moment.')).toBeVisible()
    expect(await sizeOf(dialog)).toEqual(initial)
})
