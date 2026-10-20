import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const sky = (page: Page) => page.getByRole('group', {name: 'Sky map'})
const starPanel = (page: Page) => page.getByRole('complementary', {name: 'Note'})

test('a star opens in the panel, takes a place there, shows up in Focus and is waiting after Back', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800})
    await openRoute(page, '/sky')

    // The fixture notes have no place yet: they are stars on the rim.
    await sky(page).getByRole('button', {name: 'The empty room'}).click()
    const panel = starPanel(page)
    await expect(panel.getByRole('heading', {name: 'The empty room'})).toBeVisible()
    await expect(panel).toContainText('Not in a constellation yet.')

    await panel.getByRole('button', {name: /^\+ Add/}).click()
    await panel.getByRole('button', {name: /^Music/}).click()
    await panel.getByRole('button', {name: 'Add to Music'}).click()
    await expect(panel.getByRole('button', {name: /^Music$/})).toBeVisible()

    // Skeleton hides the stars; Focus on Music shows the note placed there, and only it.
    await page.getByRole('button', {name: 'Skeleton'}).click()
    await expect(sky(page).getByRole('button', {name: 'The empty room'})).toHaveCount(0)
    await page.getByRole('button', {name: 'Close'}).click()
    await sky(page).getByRole('button', {name: 'Focus on Music'}).click()
    await expect(sky(page).getByRole('button', {name: 'The empty room'})).toBeVisible()
    await expect(sky(page).getByRole('button', {name: 'A grammar for mornings'})).toHaveCount(0)

    await sky(page).getByRole('button', {name: 'The empty room'}).click()
    await starPanel(page).getByRole('button', {name: 'Open note'}).click()
    await expect(page.getByRole('heading', {level: 1, name: 'The empty room'})).toBeVisible()

    await page.getByRole('button', {name: 'Back'}).click()
    await expect(starPanel(page).getByRole('heading', {name: 'The empty room'})).toBeVisible()
    await expect(page.getByRole('group', {name: 'Depth'})).toBeVisible()

    // YOU leads out of Focus.
    await sky(page).getByRole('button', {name: 'Exit focus'}).click()
    await expect(page.getByRole('group', {name: 'Depth'})).toHaveCount(0)
})

test('the settings sheet over the sky and Settings › Sky are one, and remember a choice', async ({page}) => {
    await openRoute(page, '/sky')
    await page.getByRole('button', {name: 'Sky settings'}).click()
    const sheet = page.getByRole('complementary', {name: 'Sky settings'})
    await sheet.getByRole('switch', {name: /Mix colours/}).click()
    await expect(sheet.getByRole('switch', {name: /Mix colours/})).toHaveAttribute('aria-checked', 'true')

    await openRoute(page, '/settings/sky')
    await expect(page.getByRole('switch', {name: /Mix colours/})).toHaveAttribute('aria-checked', 'true')
})
