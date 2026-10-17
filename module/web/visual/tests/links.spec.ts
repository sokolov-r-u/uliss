import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

test('a chat and its note link to each other from their details panels', async ({page}) => {
    await openRoute(page, '/chats/c1', 'links=on')
    const chatPanel = page.getByRole('complementary', {name: 'This chat'})
    if (!await chatPanel.isVisible()) await page.getByRole('button', {name: 'Chat details'}).click()
    await chatPanel.getByRole('button', {name: /The empty room/}).click()

    // The harness routes in memory: the opened screen, not the URL, shows where the click went.
    await expect(page.getByRole('heading', {name: 'The empty room'})).toBeVisible()
    const notePanel = page.getByRole('complementary', {name: 'This note'})
    if (!await notePanel.isVisible()) await page.getByRole('button', {name: 'Note details'}).click()
    await notePanel.getByRole('button', {name: /Constraints and the small room/}).click()

    await expect(page.getByRole('complementary', {name: 'This chat'})).toBeVisible()
})
