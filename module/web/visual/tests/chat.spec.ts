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

test('a message in an older chat moves it to the top of the side navigation', async ({page}) => {
    await openRoute(page, '/chats/c4')
    const recentChats = page.getByRole('tabpanel', {name: 'Recent chats'})
    await expect(recentChats.locator('.side-nav-group').first()).not.toContainText('A walk without the phone')

    await page.getByRole('textbox', {name: 'Message'}).fill('Still thinking about that walk')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect(recentChats.locator('.side-nav-group').first()).toContainText('A walk without the phone')
})
