import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

test('a chat and its note link to each other from their details panels', async ({page}) => {
    await openRoute(page, '/chats/c1', 'links=on')
    const chatPanel = page.getByRole('complementary', {name: 'This chat'})
    await openPanel(page, 'Chat details')
    await chatPanel.getByRole('button', {name: /The empty room/}).click()

    // The harness routes in memory: the opened screen, not the URL, shows where the click went.
    await expect(page.getByRole('heading', {name: 'The empty room'})).toBeVisible()
    const notePanel = page.getByRole('complementary', {name: 'This note'})
    await openPanel(page, 'Note details')
    await notePanel.getByRole('button', {name: /Constraints and the small room/}).click()

    await expect(page.getByRole('complementary', {name: 'This chat'})).toBeVisible()
})

/** The panel starts open on wide screens; its toggle says whether it is, before the panel's data has loaded. */
async function openPanel(page: Page, toggleLabel: string) {
    const toggle = page.getByRole('button', {name: toggleLabel})
    await expect(toggle).toBeVisible()
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
}

test('the chat delete dialog is wide on desktop and shows a cut note title whole over itself', async ({page}) => {
    await openRoute(page, '/chats/c1', 'links=on')
    await page.getByRole('button', {name: 'Actions for Constraints and the small room'}).first().click()
    await page.getByRole('menuitem', {name: 'Delete'}).click()
    const dialog = page.getByRole('dialog', {name: /Delete/})

    expect((await dialog.boundingBox())?.width).toBeGreaterThan(400)

    await dialog.getByRole('button', {name: /Notes on forgetting/}).hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveText('Notes on forgetting, and why I trust the graph to remember the long thread for me')
    const above = await tooltip.evaluate((tip) => {
        const overlay = document.querySelector('[role="dialog"]')?.parentElement
        return Number(getComputedStyle(tip).zIndex) > Number(overlay ? getComputedStyle(overlay).zIndex : 0)
    })
    expect(above).toBe(true)
})
