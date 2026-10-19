import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

async function nameIn(page: Page, dialogName: string, name: string, confirm: string) {
    const dialog = page.getByRole('dialog', {name: dialogName})
    await dialog.getByRole('textbox', {name: 'Name'}).fill(name)
    await dialog.getByRole('button', {name: confirm}).click()
    await expect(dialog).toHaveCount(0)
}

/** The branch panel, named after the open branch's level. */
const branchPanel = (page: Page) => page.getByRole('complementary', {name: /^(Constellation|Sub-constellation)$/})

const row = (page: Page, name: string) => page.getByRole('list', {name: 'Constellations'})
    .getByRole('button', {name: new RegExp(`^${name}`)})

test('a tree is built, renamed, recoloured, moved and pruned', async ({page}) => {
    await openRoute(page, '/constellations', 'data=empty')
    const panel = branchPanel(page)

    await page.getByRole('button', {name: 'New constellation'}).click()
    await nameIn(page, 'New constellation', 'Music', 'Create')
    await expect(panel).toContainText('Music')

    await panel.getByRole('button', {name: '+ New sub-constellation'}).click()
    await nameIn(page, 'New sub-constellation in Music', 'Jazz', 'Create')
    await expect(row(page, 'Jazz')).toBeVisible()
    await expect(page.getByRole('complementary', {name: 'Sub-constellation'})).toContainText('Music › Jazz')

    await panel.getByRole('button', {name: 'Rename'}).click()
    await nameIn(page, 'Rename constellation', 'Cool jazz', 'Save')
    await expect(row(page, 'Cool jazz')).toBeVisible()

    await row(page, 'Music').click()
    await panel.getByRole('button', {name: 'Change colour'}).click()
    await panel.getByRole('radio', {name: 'Hue 152'}).click()
    await panel.getByRole('button', {name: 'Save'}).click()
    await expect(panel.getByRole('radiogroup', {name: 'Palette'})).toHaveCount(0)

    await page.getByRole('button', {name: '+ New constellation'}).click()
    await nameIn(page, 'New constellation', 'Films', 'Create')

    await row(page, 'Cool jazz').click()
    await panel.getByRole('button', {name: 'Move'}).click()
    await panel.getByRole('textbox', {name: 'Move to…'}).fill('fil')
    await panel.getByRole('button', {name: /^Films/}).click()
    await panel.getByRole('button', {name: 'Move to Films'}).click()
    await expect(panel).toContainText('Films › Cool jazz')

    await panel.getByRole('button', {name: 'Move'}).click()
    await panel.getByRole('button', {name: 'Make it a root'}).click()
    await expect(page.getByRole('complementary', {name: 'Constellation'})).toBeVisible()
    await expect(page.getByText('3 roots · 3 in all')).toBeVisible()

    await row(page, 'Films').click()
    await panel.getByRole('button', {name: 'Delete constellation'}).click()
    await page.getByRole('dialog', {name: 'Delete “Films”?'}).getByRole('button', {name: 'Delete'}).click()
    await expect(row(page, 'Films')).toHaveCount(0)
    await expect(page.getByText('2 roots · 2 in all')).toBeVisible()
})

test('a taken name is refused in the dialog and a move into the own branch is not offered', async ({page}) => {
    await openRoute(page, '/constellations')
    const panel = branchPanel(page)

    await row(page, 'Music').click()
    await panel.getByRole('button', {name: 'Rename'}).click()
    const dialog = page.getByRole('dialog', {name: 'Rename constellation'})
    await dialog.getByRole('textbox', {name: 'Name'}).fill('films')
    await dialog.getByRole('button', {name: 'Save'}).click()
    await expect(dialog).toContainText('“films” is already taken here. Pick another name.')
    await dialog.getByRole('button', {name: 'Cancel'}).click()

    await panel.getByRole('button', {name: 'Move'}).click()
    const picker = panel.getByRole('list')
    await expect(picker.getByRole('button', {name: /^Films/})).toBeVisible()
    await expect(picker.getByRole('button', {name: /^(Music|Jazz|Miles|Ambient)/})).toHaveCount(0)
})

test('on a phone the branch opens as a drawer and closes back to the tree', async ({page}) => {
    await page.setViewportSize({width: 375, height: 667})
    await openRoute(page, '/constellations')

    await row(page, 'Music').click()
    const panel = page.getByRole('complementary', {name: 'Constellation'})
    await expect(panel).toBeInViewport()
    await panel.getByRole('button', {name: 'Close panel'}).click()

    await expect(panel).toHaveCount(0)
    await expect(row(page, 'Jazz')).toBeVisible()
})
