import {expect, type Page, test} from '@playwright/test'
import {openRoute} from './routes'

const notePanel = (page: Page) => page.getByRole('complementary', {name: 'This note'})

const PARENT = 'A grammar for mornings'

const recentNotes = (page: Page) => page.getByRole('tabpanel', {name: 'Recent notes'})

/** Opens a note from the side navigation, so the in-memory API keeps its state. */
async function openNote(page: Page, title: string) {
    await page.getByRole('tab', {name: 'Notes'}).click()
    await recentNotes(page).getByRole('button', {name: new RegExp(`^${title}`)}).first().click()
}

/** Adds the open top note to the constellation reached through [walk]. */
async function addPlace(page: Page, walk: string[]) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: 'Add to…'}).click()
    for (const name of walk) await panel.getByRole('button', {name: new RegExp(`^${name}`)}).click()
    await panel.getByRole('button', {name: `Add to ${walk[walk.length - 1]}`}).click()
    await expect(panel.getByRole('group', {name: walk.join(' / '), exact: true})).toBeVisible()
}

/** Puts the open note into Music / Jazz through its panel. */
async function placeInJazz(page: Page) {
    await addPlace(page, ['Music', 'Jazz'])
}

/** Moves the open note under the note found by [query], confirming the move. */
async function moveUnder(page: Page, query: string, title: string) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: 'Add to…'}).click()
    await panel.getByRole('textbox', {name: 'Add this note to…'}).fill(query)
    await panel.getByRole('button', {name: `Move under ${title}`}).click()
    await page.getByRole('dialog', {name: `Move under “${title}”?`}).getByRole('button', {name: 'Move'}).click()
    await expect(panel.getByRole('link', {name: title})).toBeVisible()
}

/** A note under "A grammar for mornings", which lives in Music › Jazz. */
async function nestUnderParent(page: Page) {
    await openRoute(page, '/notes/n2')
    await placeInJazz(page)
    await openNote(page, 'The empty room')
    await moveUnder(page, 'gram', PARENT)
}

const treeRow = (page: Page, name: string) => page.getByRole('list', {name: 'Constellations'})
    .getByRole('button', {name: new RegExp(`^${name}`)})

test('a note moved under another lives in its place, is counted there and nests under it', async ({page}) => {
    await nestUnderParent(page)
    const panel = notePanel(page)
    const path = panel.getByRole('group', {name: 'Place'})
    await expect(path).toContainText('Jazz')
    await expect(path.getByRole('button', {name: `Out of “${PARENT}”`})).toBeVisible()

    await panel.getByRole('link', {name: PARENT}).click()
    const subNotes = notePanel(page)
    await expect(subNotes).toContainText('Sub-notes')
    await expect(subNotes.getByRole('button', {name: /^The empty room/})).toBeVisible()

    await page.getByRole('link', {name: 'Constellations'}).first().click()
    await expect(treeRow(page, 'Music')).toContainText('2')
    await treeRow(page, 'Music').click()
    await treeRow(page, 'Jazz').click()
    const branch = page.getByRole('complementary', {name: 'Sub-constellation'})
    await expect(branch.getByRole('button', {name: /^The empty room/})).toHaveCount(0)
    await branch.getByRole('button', {name: `Show 1 sub-note of ${PARENT}`}).click()
    await expect(branch.getByRole('button', {name: /^The empty room/})).toBeVisible()
})

test('a sub-note moves out into a constellation, and never under its own sub-notes', async ({page}) => {
    await nestUnderParent(page)
    const panel = notePanel(page)

    // Moving the parent: its own sub-note is not offered.
    await panel.getByRole('link', {name: PARENT}).click()
    await notePanel(page).getByRole('button', {name: 'Add to…'}).click()
    await notePanel(page).getByRole('textbox', {name: 'Add this note to…'}).fill('empty')
    await expect(notePanel(page).getByText('0 / 0')).toBeVisible()
    await notePanel(page).getByRole('button', {name: 'Close picker'}).click()

    await openNote(page, 'The empty room')
    // A sub-note's picker offers constellations only.
    await notePanel(page).getByRole('button', {name: 'Add to…'}).click()
    await notePanel(page).getByRole('button', {name: /^Films/}).click()
    await notePanel(page).getByRole('button', {name: 'Move to Films'}).click()
    const dialog = page.getByRole('dialog', {name: 'Move to Films?'})
    await expect(dialog).toContainText(`It leaves “${PARENT}” and goes to Films only. It will no longer be in Music / Jazz.`)
    await dialog.getByRole('button', {name: 'Move'}).click()
    await expect(notePanel(page).getByRole('group', {name: 'Films'})).toBeVisible()
    await expect(notePanel(page).getByRole('link', {name: PARENT})).toHaveCount(0)
})

test('a cross on the parent leaves it along its main line, naming the parent\'s other places', async ({page}) => {
    await openRoute(page, '/notes/n2')
    await placeInJazz(page)
    await addPlace(page, ['Films'])
    await openNote(page, 'The empty room')
    await moveUnder(page, 'gram', PARENT)
    await openNote(page, 'Why I resisted it')
    await moveUnder(page, 'empty', 'The empty room')

    const path = notePanel(page).getByRole('group', {name: 'Place'})
    // The main line of the top note, then the parent notes: a cross on each segment.
    await expect(path.getByRole('button')).toHaveCount(4)
    await path.getByRole('button', {name: `Out of “${PARENT}”`}).click()
    const dialog = page.getByRole('dialog', {name: 'Move to Music / Jazz?'})
    await expect(dialog).toContainText(`It leaves “${PARENT}” / “The empty room” and goes to Music / Jazz only.`
        + ' It will no longer be in Films.')
    await dialog.getByRole('button', {name: 'Move'}).click()
    await expect(notePanel(page).getByRole('group', {name: 'Music / Jazz', exact: true})).toBeVisible()
    await expect(notePanel(page).getByRole('link', {name: PARENT})).toHaveCount(0)
})

test('deleting a parent keeps its sub-notes in its place when asked to', async ({page}) => {
    await nestUnderParent(page)
    await notePanel(page).getByRole('link', {name: PARENT}).click()

    // the note's own header, not the same row in the side navigation's recent notes
    await page.getByRole('main').getByRole('button', {name: `Actions for ${PARENT}`}).click()
    await page.getByRole('menuitem', {name: 'Delete'}).click()
    const dialog = page.getByRole('dialog', {name: `Delete “${PARENT}”?`})
    await expect(dialog).toContainText('has a sub-note')
    await expect(dialog.getByRole('radio', {name: /Keep sub-notes/})).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('button', {name: 'Delete'}).click()
    await expect(dialog).toHaveCount(0)

    await openNote(page, 'The empty room')
    await expect(notePanel(page).getByRole('group', {name: 'Music / Jazz', exact: true})).toBeVisible()
})

test('deleting a parent with all its sub-notes takes the whole branch', async ({page}) => {
    await nestUnderParent(page)
    await notePanel(page).getByRole('link', {name: PARENT}).click()

    // the note's own header, not the same row in the side navigation's recent notes
    await page.getByRole('main').getByRole('button', {name: `Actions for ${PARENT}`}).click()
    await page.getByRole('menuitem', {name: 'Delete'}).click()
    const dialog = page.getByRole('dialog', {name: `Delete “${PARENT}”?`})
    await dialog.getByRole('radio', {name: /Delete all/}).click()
    await dialog.getByRole('button', {name: 'Delete'}).click()

    await expect(dialog).toHaveCount(0)
    await page.getByRole('tab', {name: 'Notes'}).click()
    await expect(recentNotes(page).getByRole('button', {name: /^The empty room/})).toHaveCount(0)
    await expect(recentNotes(page).getByRole('button', {name: /^Why I resisted it/})).toBeVisible()
})

test('a first summary goes under a note picked by its title', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = page.getByRole('dialog', {name: 'Create a summary note?'})
    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    const step = page.getByRole('dialog', {name: 'Choose a place'})
    await step.getByRole('textbox', {name: 'Find a place…'}).fill('gram')
    // the first match is selected as soon as it is found
    await step.getByRole('button', {name: `Put under ${PARENT}`}).click()
    await expect(dialog.getByRole('button', {name: `Place: ${PARENT}`})).toBeVisible()
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await openNote(page, PARENT)
    await expect(notePanel(page).getByRole('button', {name: /^Constraints and the small room/})).toBeVisible()
})

test('a first summary goes under a note reached by stepping through the matches', async ({page}) => {
    await openRoute(page, '/chats/c1')
    await page.getByRole('button', {name: 'Summarize'}).click()
    const dialog = page.getByRole('dialog', {name: 'Create a summary note?'})
    await dialog.getByRole('button', {name: 'Place: Choose a place'}).click()
    const step = page.getByRole('dialog', {name: 'Choose a place'})
    const search = step.getByRole('textbox', {name: 'Find a place…'})

    await search.fill('why')
    await expect(step.getByText('1 / 2')).toBeVisible()
    await search.press('Enter')
    await expect(step.getByText('2 / 2')).toBeVisible()
    await expect(step.getByRole('button', {name: /^Why I resisted it/})).toHaveAttribute('aria-pressed', 'true')
    await search.press('ArrowUp')
    await expect(step.getByText('1 / 2')).toBeVisible()
    await step.getByRole('button', {name: 'Next match'}).click()
    await expect(search).toBeFocused()
    await step.getByRole('button', {name: 'Put under Why I resisted it'}).click()
    await dialog.getByRole('button', {name: 'Summarize', exact: true}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await openNote(page, 'Why I resisted it')
    await expect(notePanel(page).getByRole('button', {name: /^Constraints and the small room/})).toBeVisible()
})

