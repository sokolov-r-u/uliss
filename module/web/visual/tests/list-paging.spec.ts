import {expect, test} from '@playwright/test'
import {openRoute} from './routes'

// The fake service pages its fixtures two at a time here; a page that fits the screen keeps asking for the next one.

const NOTE_TITLES = ['The empty room', 'A grammar for mornings', 'Why I resisted it']

test('the notes list loads its next pages as they come into view and counts every note', async ({page}) => {
    await openRoute(page, '/notes', 'pageSize=2')
    const list = page.locator('.product-list')

    for (const title of NOTE_TITLES) await expect(list.getByText(title, {exact: true})).toBeVisible()
    await expect(list.getByRole('button', {name: /^Actions for /})).toHaveCount(4)
    await expect(page.locator('.product-view').getByText('4', {exact: true}).first()).toBeVisible()
})

test('the side panel loads every chat page by page', async ({page}) => {
    await openRoute(page, '/notes', 'pageSize=2')
    const panel = page.getByRole('tabpanel', {name: 'Recent chats'})

    for (const title of ['Constraints and the small room', 'A walk without the phone', 'Why the graph feels honest']) {
        await expect(panel.getByRole('button', {name: title})).toBeVisible()
    }
})

test('a failed next page offers Retry and keeps the loaded rows', async ({page}) => {
    await openRoute(page, '/notes', 'pageSize=2&more=fail-once')
    const list = page.locator('.product-list')

    await expect(list.getByRole('alert')).toHaveText('Could not load more.')
    await expect(list.getByRole('button', {name: /^Actions for /})).toHaveCount(2)

    await list.getByRole('button', {name: 'Retry'}).click()

    await expect(list.getByRole('button', {name: /^Actions for /})).toHaveCount(4)
    await expect(list.getByRole('alert')).toHaveCount(0)
})
