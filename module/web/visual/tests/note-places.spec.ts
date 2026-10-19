import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const notePanel = (page: Page) => page.getByRole('complementary', {name: 'This note'})

/** Opens "+ Add constellation" (or "+ Add" on a note without places), walks or searches to a branch and adds it. */
async function addPlace(page: Page, walk: string[], search?: string) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: /^\+ Add/}).click()
    if (search) await panel.getByRole('textbox', {name: 'Add this note to…'}).fill(search)
    for (const name of walk) await panel.getByRole('button', {name: new RegExp(`^${name}`)}).click()
    await panel.getByRole('button', {name: `Add to ${walk[walk.length - 1]}`}).click()
}

async function openConstellations(page: Page) {
    await page.getByRole('link', {name: 'Constellations'}).first().click()
    await expect(page.getByRole('list', {name: 'Constellations'})).toBeVisible()
}

const treeRow = (page: Page, name: string) => page.getByRole('list', {name: 'Constellations'})
    .getByRole('button', {name: new RegExp(`^${name}`)})

test('a note is placed through the tree picker, keeps one place per line and changes its main place', async ({page}) => {
    await openRoute(page, '/notes/n1')
    const panel = notePanel(page)
    await expect(panel).toContainText('Not in a constellation yet.')

    await addPlace(page, ['Music', 'Jazz'])
    // One place: nothing to choose the main place from.
    await expect(panel.getByRole('button', {name: /Music ›\s*Jazz/})).toBeDisabled()

    await addPlace(page, ['Films'], 'fil')
    await expect(panel.getByRole('button', {name: 'Remove Films'})).toBeVisible()

    await panel.getByRole('button', {name: /Music ›\s*Jazz/}).click()
    await panel.getByRole('list', {name: 'Make main'}).getByRole('button', {name: 'Films'}).click()
    await expect(panel.getByRole('button', {name: /^Films$/})).toBeEnabled()
    await expect(panel.getByRole('button', {name: 'Remove Jazz'})).toBeVisible()

    // Miles lies on Jazz's line: it takes Jazz's place.
    await addPlace(page, ['Miles'], 'mil')
    await expect(panel.getByRole('button', {name: 'Remove Miles'})).toBeVisible()
    await expect(panel.getByRole('button', {name: 'Remove Jazz'})).toHaveCount(0)

    await panel.getByRole('button', {name: '+ Add constellation'}).click()
    await panel.getByRole('button', {name: /^Fear/}).click()
    await panel.getByRole('button', {name: '+ New in Fear'}).click()
    await panel.getByRole('textbox', {name: 'New constellation in Fear'}).fill('Night')
    await page.keyboard.press('Enter')
    await panel.getByRole('button', {name: 'Add to Night'}).click()
    await expect(panel.getByRole('button', {name: 'Remove Night'})).toBeVisible()

    await openConstellations(page)
    await expect(treeRow(page, 'Music')).toContainText('1')
    await expect(treeRow(page, 'Without constellation')).toBeVisible()
    await treeRow(page, 'Fear').click()
    await treeRow(page, 'Night').click()
    await expect(page.getByRole('complementary', {name: 'Sub-constellation'})).toContainText('The empty room')
})

test('deleting a root asks where its notes go and moves them there', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await addPlace(page, ['Noir'], 'noir')

    await openConstellations(page)
    const panel = page.getByRole('complementary', {name: 'Constellation'})
    await treeRow(page, 'Films').click()
    await panel.getByRole('button', {name: 'Delete constellation'}).click()
    const dialog = page.getByRole('dialog', {name: 'Delete “Films”?'})
    await expect(dialog).toContainText('Films holds 1 note with no other place.')
    await expect(dialog.getByRole('button', {name: 'Delete'})).toBeDisabled()

    await dialog.getByRole('button', {name: /Move to/}).click()
    await dialog.getByRole('button', {name: /^Music/}).click()
    await dialog.getByRole('button', {name: 'Move them to Music'}).click()
    await dialog.getByRole('button', {name: 'Delete'}).click()
    await expect(dialog).toHaveCount(0)

    await treeRow(page, 'Music').click()
    await expect(panel).toContainText('A grammar for mornings')
})
