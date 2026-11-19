import {expect, type Locator, test} from '@playwright/test'
import {openRoute} from './routes'

async function heightOf(element: Locator) {
    const box = await element.boundingBox()
    expect(box).not.toBeNull()
    return Math.round(box?.height ?? 0)
}

test('a long chat suggests saving it under Summarize and still takes messages', async ({page}) => {
    await openRoute(page, '/chats/c1', 'tail=long')

    await expect(page.getByText('This chat is getting long — save it to a note')).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message'})).toBeVisible()
})

test('a refused message waits in the banner until Summarize saves the chat', async ({page}) => {
    await openRoute(page, '/chats/c1', 'tail=full')
    await page.getByRole('textbox', {name: 'Message'}).fill('One more thing')
    await page.getByRole('button', {name: 'Send'}).click()

    const banner = page.getByRole('region', {name: 'This chat is too long. Save it to a note to continue'})
    await expect(banner).toContainText('«One more thing»')
    await expect(page.getByRole('textbox', {name: 'Message'})).toHaveCount(0)
    const height = await heightOf(banner)

    await banner.getByRole('button', {name: 'Summarize'}).click()
    await page.getByRole('dialog', {name: 'Create a summary note?'})
        .getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(banner).toContainText('saving the chat to a note…')
    // the hidden action keeps its place, so the banner does not jump
    expect(await heightOf(banner)).toBe(height)

    // the page re-reads the tail every few seconds while the summary runs
    const input = page.getByRole('textbox', {name: 'Message'})
    await expect(input).toHaveValue('One more thing', {timeout: 10_000})
    await expect(input).toBeFocused()
    await expect(banner).toHaveCount(0)
})
