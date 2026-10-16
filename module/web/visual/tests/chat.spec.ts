import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

test('a sent message shows what the assistant is doing until its reply starts', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('textbox', {name: 'Message'}).fill('What music do I like?')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect(page.getByText('What music do I like?')).toBeVisible()
    await expect(page.getByRole('status').filter({hasText: 'searching notes…'})).toBeVisible()
    await expect(page.getByText('thinking…')).toHaveCount(0)
})
