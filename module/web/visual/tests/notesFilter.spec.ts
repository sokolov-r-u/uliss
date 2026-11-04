import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

// `places=on`: "The empty room" lives in Jazz (under Music), "A grammar for mornings" in Films; the rest has no place.

async function pick(page: Page, name: string) {
    await page.getByRole('button', {name: 'Filter by constellation'}).click()
    await page.getByRole('textbox', {name: 'Find a constellation'}).fill(name)
    await page.getByRole('button', {name: `Show ${name}`}).click()
}

const rows = (page: Page) => page.locator('.product-list').getByRole('button', {name: /^(?!Actions for)/})
const bar = (page: Page) => page.getByLabel('Constellation filter')

test('the constellation filter keeps a whole branch, joins constellations, and clears', async ({page}) => {
    await openRoute(page, '/notes', 'places=on')

    await pick(page, 'Music')
    await expect(rows(page)).toHaveText([/The empty room/])
    await expect(page.locator('.screen-head-count')).toHaveText('1 of 5')
    await expect(bar(page)).toContainText('Music')

    await pick(page, 'Films')
    await expect(rows(page)).toHaveText([/The empty room/, /A grammar for mornings/])
    await expect(page.locator('.screen-head-count')).toHaveText('2 of 5')

    await bar(page).getByRole('button', {name: 'Remove Music'}).click()
    await expect(rows(page)).toHaveText([/A grammar for mornings/])

    await bar(page).getByRole('button', {name: 'Clear'}).click()
    await expect(bar(page)).toHaveCount(0)
    await expect(rows(page)).toHaveCount(5)
})

test('picking a constellation with no notes says so and clears from there', async ({page}) => {
    await openRoute(page, '/notes', 'places=on')

    await pick(page, 'Fear')

    await expect(page.getByText('No notes in these constellations')).toBeVisible()
    await expect(page.locator('.screen-head-count')).toHaveText('0 of 5')
    await page.getByRole('button', {name: 'Clear filter'}).click()
    await expect(rows(page)).toHaveCount(5)
})

test('the Pinned group keeps only the pinned notes of the filter', async ({page}) => {
    await openRoute(page, '/notes', 'places=on')
    const list = page.locator('.product-list')
    await list.getByRole('button', {name: 'Actions for The empty room'}).click()
    await page.getByRole('menuitem', {name: 'Pin'}).click()
    await expect(list.locator('.list-group').first()).toContainText('Pinned')

    await pick(page, 'Films')
    await expect(list.getByText('Pinned', {exact: true})).toHaveCount(0)
    await expect(rows(page)).toHaveText([/A grammar for mornings/])

    await bar(page).getByRole('button', {name: 'Clear'}).click()
    await pick(page, 'Music')
    await expect(list.locator('.list-group').first()).toContainText('Pinned')
    await expect(rows(page)).toHaveText([/The empty room/])
})
