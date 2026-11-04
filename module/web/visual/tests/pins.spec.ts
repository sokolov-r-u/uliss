import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

// The fake service pins in memory, starting with nothing pinned, and leaves pinned items out of the list pages.

test('a chat pinned from the side panel moves into its Pinned group and back out when unpinned', async ({page}) => {
    await openRoute(page, '/chats')
    const panel = page.getByRole('tabpanel', {name: 'Recent chats'})
    const title = 'Morning ritual, second attempt'

    await panel.getByRole('button', {name: `Actions for ${title}`}).click()
    await page.getByRole('menuitem', {name: 'Pin'}).click()

    const first = panel.locator('.side-nav-group').first()
    await expect(first).toContainText('Pinned')
    await expect(first.getByRole('button', {name: title, exact: true})).toBeVisible()
    await expect(panel.getByRole('button', {name: title, exact: true})).toHaveCount(1)
    const list = page.locator('.product-list')
    await expect(list.locator('.list-group').first()).toContainText('Pinned')
    await expect(list.getByRole('button', {name: new RegExp(`^${title}`)})).toHaveCount(1)

    await panel.getByRole('button', {name: `Actions for ${title}`}).click()
    await page.getByRole('menuitem', {name: 'Unpin'}).click()

    await expect(panel.getByText('Pinned', {exact: true})).toHaveCount(0)
    await expect(panel.getByRole('button', {name: title, exact: true})).toHaveCount(1)
})

test('a note pinned on the Notes screen heads that list and the side panel Notes tab', async ({page}) => {
    await openRoute(page, '/notes')
    const list = page.locator('.product-list')

    await list.getByRole('button', {name: 'Actions for Why I resisted it'}).click()
    await page.getByRole('menuitem', {name: 'Pin'}).click()

    const pinnedGroup = list.locator('.list-group').first()
    await expect(pinnedGroup).toContainText('Pinned')
    await expect(pinnedGroup.getByRole('button', {name: /^Why I resisted it/})).toBeVisible()
    await page.getByRole('tab', {name: 'Notes'}).click()
    const panel = page.getByRole('tabpanel', {name: 'Recent notes'})
    await expect(panel.locator('.side-nav-group').first()).toContainText('Why I resisted it')
    await expect(panel.getByRole('button', {name: 'Why I resisted it', exact: true})).toHaveCount(1)
})

test('a refused pin explains itself in a notice and leaves the lists as they were', async ({page}) => {
    await openRoute(page, '/notes', 'pins=refuse')
    const list = page.locator('.product-list')

    await list.getByRole('button', {name: 'Actions for The empty room'}).click()
    await page.getByRole('menuitem', {name: 'Pin'}).click()

    const notice = page.getByRole('dialog', {name: 'Could not pin this note'})
    await expect(notice).toContainText('15 notes are pinned already. Unpin one first.')
    await notice.getByRole('button', {name: 'Close'}).click()
    await expect(notice).toHaveCount(0)
    await expect(list.getByText('Pinned', {exact: true})).toHaveCount(0)
})
