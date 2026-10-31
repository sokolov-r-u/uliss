import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const notePanel = (page: Page) => page.getByRole('complementary', {name: 'This note'})

/** Opens "Add to…", walks or searches to a branch and picks it; a pick that displaces a place asks first. */
async function addPlace(page: Page, walk: string[], search?: string) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: 'Add to…'}).click()
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

const placeRow = (page: Page, path: string) => notePanel(page).getByRole('group', {name: path, exact: true})

test('a note is placed through the tree picker, keeps one place per line and changes its main place', async ({page}) => {
    await openRoute(page, '/notes/n1')
    const panel = notePanel(page)
    await expect(panel).toContainText('Not in a constellation yet.')

    await addPlace(page, ['Music', 'Jazz'])
    // One place is not marked main.
    await expect(placeRow(page, 'Music / Jazz')).toBeVisible()
    await expect(panel.getByText('Main', {exact: true})).toHaveCount(0)

    // A place on another line is added at once.
    await addPlace(page, ['Films'], 'fil')
    await expect(placeRow(page, 'Films')).toBeVisible()
    await expect(placeRow(page, 'Music / Jazz').getByText('Main', {exact: true})).toBeVisible()

    await panel.getByRole('button', {name: 'Make Films main'}).click()
    await expect(placeRow(page, 'Films').getByText('Main', {exact: true})).toBeVisible()

    // Miles lies on Jazz's line: it takes Jazz's place after a confirmation.
    await addPlace(page, ['Miles'], 'mil')
    const dialog = page.getByRole('dialog', {name: 'Move to Music / Jazz / Miles?'})
    await expect(dialog).toContainText('It leaves Music / Jazz. It stays in Films.')
    await dialog.getByRole('button', {name: 'Move'}).click()
    await expect(placeRow(page, 'Music / Jazz / Miles')).toBeVisible()
    await expect(placeRow(page, 'Music / Jazz')).toHaveCount(0)

    await panel.getByRole('button', {name: 'Add to…'}).click()
    await panel.getByRole('button', {name: /^Fear/}).click()
    await panel.getByRole('button', {name: '+ New in Fear'}).click()
    await panel.getByRole('textbox', {name: 'New constellation in Fear'}).fill('Night')
    await page.keyboard.press('Enter')
    await panel.getByRole('button', {name: 'Add to Night'}).click()
    await expect(placeRow(page, 'Fear / Night')).toBeVisible()

    await openConstellations(page)
    await expect(treeRow(page, 'Music')).toContainText('1')
    await expect(treeRow(page, 'Without constellation')).toBeVisible()
    await treeRow(page, 'Fear').click()
    await treeRow(page, 'Night').click()
    await expect(page.getByRole('complementary', {name: 'Sub-constellation'})).toContainText('The empty room')
})

test('a cross moves the note to the segment before it, and the dialog keeps its size', async ({page}) => {
    await openRoute(page, '/notes/n1')
    await addPlace(page, ['Music', 'Jazz', 'Miles'])
    await addPlace(page, ['Films'], 'fil')

    await placeRow(page, 'Music / Jazz / Miles').getByRole('button', {name: 'Out of Jazz'}).click()
    const dialog = page.getByRole('dialog', {name: 'Move to Music?'})
    await expect(dialog).toContainText('It leaves Music / Jazz / Miles. It stays in Films.')
    const before = await dialog.boundingBox()

    // A failed move shows its error in the same dialog, at the same size.
    await page.evaluate(() => sessionStorage.setItem('visual.place', 'fail-once'))
    await dialog.getByRole('button', {name: 'Move'}).click()
    await expect(dialog.getByRole('alert')).toContainText('This note or constellation no longer exists.')
    expect(await dialog.boundingBox()).toEqual(before)

    // While the move runs the dialog says so, at the same size.
    await page.evaluate(() => sessionStorage.setItem('visual.place', 'hold'))
    await dialog.getByRole('button', {name: 'Move'}).click()
    await expect(dialog.getByRole('button', {name: 'Moving…'})).toBeDisabled()
    expect(await dialog.boundingBox()).toEqual(before)
    await page.evaluate(() => sessionStorage.removeItem('visual.place'))
    await expect(dialog).toHaveCount(0)
    await expect(placeRow(page, 'Music')).toBeVisible()
    await expect(placeRow(page, 'Music').getByText('Main', {exact: true})).toBeVisible()

    // Off the root the place goes, and the main passes to the one left.
    await placeRow(page, 'Music').getByRole('button', {name: 'Out of Music'}).click()
    const remove = page.getByRole('dialog', {name: 'Remove from Music?'})
    await expect(remove).toContainText('It stays in Films. Films becomes the main place.')
    await remove.getByRole('button', {name: 'Remove'}).click()
    await expect(placeRow(page, 'Music')).toHaveCount(0)
    await expect(placeRow(page, 'Films')).toBeVisible()
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
