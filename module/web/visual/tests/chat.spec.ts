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

test('Retry regenerates a failed latest reply in place', async ({page}) => {
    await openRoute(page, '/chats/c2')
    await expect(page.getByText('failed to reply')).toBeVisible()

    await page.getByRole('button', {name: 'Retry'}).click()

    await expect(page.getByText('The first attempt already cleared the ground.')).toBeVisible()
    await expect(page.getByText('failed to reply')).toHaveCount(0)
    await expect(page.getByRole('button', {name: 'Retry'})).toHaveCount(0)
    await expect(page.getByText('Why does the second attempt feel easier?')).toHaveCount(1)
    await expect(page.getByRole('textbox', {name: 'Message'})).toBeEnabled()
})

test('a new chat takes its generated title in the header and the side navigation, even after the reply ends', async ({page}) => {
    await openRoute(page, '/chats/new')
    await page.getByRole('textbox', {name: 'Message'}).fill('Ideas for a week in Lisbon\nwith two kids')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect(page.getByText('Start with the dates, then the places.')).toBeVisible()
    const recentChats = page.getByRole('tabpanel', {name: 'Recent chats'})
    await expect(page.getByRole('heading', {name: 'Trip planning'})).toBeVisible()
    await expect(recentChats).toContainText('Trip planning')
    await expect(recentChats).not.toContainText('Ideas for a week in Lisbon')
})
