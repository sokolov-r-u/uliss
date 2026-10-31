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

    await panel.getByRole('button', {name: 'Add to…'}).click()
    await panel.getByRole('button', {name: /^Music/}).click()
    await panel.getByRole('button', {name: 'Add to Music'}).click()
    await expect(panel.getByRole('group', {name: 'Music', exact: true})).toBeVisible()

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

test('the keyboard reaches the sky with one Tab, moves by direction, names the star and leaves with Escape', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800})
    await openRoute(page, '/sky')
    const focusedId = () => page.evaluate(() => document.activeElement?.getAttribute('data-node-id') ?? null)

    // from the nav, Tab goes straight to the graph instead of the next of twenty sidebar controls
    await expect(page.locator('[data-sky-entry]')).toHaveCount(1)
    await page.getByRole('link', {name: 'Notes'}).focus()
    await page.keyboard.press('Tab')
    const entry = await focusedId()
    expect(entry).not.toBeNull()
    await page.keyboard.press('Tab')
    expect(await focusedId()).toBe(entry)

    await page.locator('[data-node-id="k-music"]').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('[data-node-id="k-jazz"]')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('[data-node-id="k-noir"]')).toBeFocused()
    await expect(page.locator('[data-node-id="k-noir"] .sky-focus-ring')).toHaveCSS('stroke-dasharray', '3px, 3px')

    // a rim star's name is faint until the keyboard reaches it
    await page.locator('[data-node-id="k-films"]').focus()
    const rimName = page.locator('[data-node-id="n3"] text')
    await expect(rimName).not.toHaveAttribute('opacity', '1')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-node-id="n3"]')).toBeFocused()
    await expect(rimName).toHaveAttribute('opacity', '1')

    await page.keyboard.press('Escape')
    expect(await focusedId()).toBeNull()
    await expect(rimName).not.toHaveAttribute('opacity', '1')
})

test('a note found in the filter shows its constellation, its star and its panel', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800})
    await openRoute(page, '/sky')
    await sky(page).getByRole('button', {name: 'The empty room'}).click()
    const panel = starPanel(page)
    await panel.getByRole('button', {name: 'Add to…'}).click()
    await panel.getByRole('button', {name: /^Music/}).click()
    await panel.getByRole('button', {name: 'Add to Music'}).click()
    // the place is stored and the sky has read it again before the filter looks the note up
    await expect(panel.getByRole('group', {name: 'Music', exact: true})).toBeVisible()
    await page.getByRole('button', {name: 'Close'}).click()
    await page.getByRole('button', {name: 'Skeleton'}).click()
    await expect(sky(page).getByRole('button', {name: 'The empty room'})).toHaveCount(0)

    await page.getByRole('button', {name: 'Filter by constellation'}).click()
    await page.getByRole('textbox', {name: 'Find a constellation or a note'}).fill('empty room')
    await page.getByRole('button', {name: 'Show The empty room'}).click()

    await expect(page.getByRole('button', {name: /· Music/})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Full'})).toHaveAttribute('aria-pressed', 'true')
    await expect(sky(page).getByRole('button', {name: 'The empty room'})).toBeVisible()
    await expect(starPanel(page).getByRole('heading', {name: 'The empty room'})).toBeVisible()
})

