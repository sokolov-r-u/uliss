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

/** Puts the open note into Music › Jazz through its panel. */
async function placeInJazz(page: Page) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: /^\+ Add/}).click()
    await panel.getByRole('button', {name: /^Music/}).click()
    await panel.getByRole('button', {name: /^Jazz/}).click()
    await panel.getByRole('button', {name: 'Add to Jazz'}).click()
    await expect(panel.getByRole('button', {name: /Music ›\s*Jazz/})).toBeVisible()
}

/** Moves the open note under the note found by [query]. */
async function moveUnder(page: Page, query: string, title: string) {
    const panel = notePanel(page)
    await panel.getByRole('button', {name: 'Move under a note'}).click()
    await panel.getByRole('textbox', {name: 'Move this note under…'}).fill(query)
    await panel.getByRole('button', {name: new RegExp(`^${title}`)}).click()
    await panel.getByRole('button', {name: `Move under ${title}`}).click()
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
    await expect(panel).toContainText(`Lives where ${PARENT} lives.`)
    await expect(panel).toContainText('Jazz ›')
    await expect(panel.getByRole('button', {name: /^\+ Add/})).toHaveCount(0)

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
    await notePanel(page).getByRole('button', {name: 'Move under a note'}).click()
    await notePanel(page).getByRole('textbox', {name: 'Move this note under…'}).fill('empty')
    await expect(notePanel(page)).toContainText('Nothing matches.')
    await notePanel(page).getByRole('button', {name: 'Close picker'}).click()

    await openNote(page, 'The empty room')
    await notePanel(page).getByRole('button', {name: 'Move out'}).click()
    await notePanel(page).getByRole('button', {name: /^Films/}).click()
    await notePanel(page).getByRole('button', {name: 'Move to Films'}).click()
    await expect(notePanel(page).getByRole('button', {name: 'Remove from Films'})).toBeVisible()
    await expect(notePanel(page).getByRole('link', {name: PARENT})).toHaveCount(0)
})

test('deleting a parent keeps its sub-notes in its place when asked to', async ({page}) => {
    await nestUnderParent(page)
    await notePanel(page).getByRole('link', {name: PARENT}).click()

    await page.getByRole('button', {name: `Actions for ${PARENT}`}).click()
    await page.getByRole('menuitem', {name: 'Delete'}).click()
    const dialog = page.getByRole('dialog', {name: `Delete “${PARENT}”?`})
    await expect(dialog).toContainText('has a sub-note')
    await expect(dialog.getByRole('radio', {name: /Keep sub-notes/})).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('button', {name: 'Delete'}).click()
    await expect(dialog).toHaveCount(0)

    await openNote(page, 'The empty room')
    await expect(notePanel(page).getByRole('button', {name: /Music ›\s*Jazz/})).toBeVisible()
})

test('deleting a parent with all its sub-notes takes the whole branch', async ({page}) => {
    await nestUnderParent(page)
    await notePanel(page).getByRole('link', {name: PARENT}).click()

    await page.getByRole('button', {name: `Actions for ${PARENT}`}).click()
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
    await dialog.getByRole('textbox', {name: 'Put the note in…'}).fill('gram')
    await dialog.getByRole('button', {name: new RegExp(`^${PARENT}`)}).click()
    await dialog.getByRole('button', {name: `Summarize under ${PARENT}`}).click()
    await expect(page.getByRole('status', {name: 'Summary note'})).toContainText('Uliss is writing a note')

    await openNote(page, PARENT)
    await expect(notePanel(page).getByRole('button', {name: /^Constraints and the small room/})).toBeVisible()
})
