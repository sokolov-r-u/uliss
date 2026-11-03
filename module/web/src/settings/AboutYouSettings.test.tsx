import {act, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError} from '../notes/noteApi'
import {AboutYouSettings} from './AboutYouSettings'
import {getProfile, rebuildProfile, saveAbout, saveRules, type UserProfile} from './profileApi'

vi.mock('./profileApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('./profileApi')>(),
    getProfile: vi.fn(),
    rebuildProfile: vi.fn(),
    saveAbout: vi.fn(),
    saveRules: vi.fn(),
}))

const mockedProfile = vi.mocked(getProfile)
const mockedRebuild = vi.mocked(rebuildProfile)
const mockedSaveAbout = vi.mocked(saveAbout)
const mockedSaveRules = vi.mocked(saveRules)

function renderScreen() {
    render(<MemoryRouter><AboutYouSettings/></MemoryRouter>)
}

const IDLE = {running: false, remaining: 2, availableAt: null}
const NO_INPUT = {about: null, rules: [], applyingRules: false, rulesFailed: false}

function profile(fields: Partial<UserProfile> = {}): UserProfile {
    return {content: 'Jazz.', updatedAt: null, rebuild: IDLE, ...NO_INPUT, ...fields}
}

/** The body of the section the header button of [title] opens. */
function section(title: string): HTMLElement {
    return document.getElementById(header(title).getAttribute('aria-controls')!)!
}

/** The header button of the section titled [title]; its accessible name runs on into the hint. */
function header(title: string): HTMLElement {
    const found = screen.getAllByRole('button').find((button) => button.querySelector('span > span')?.textContent === title)
    if (!found) throw new Error(`no section ${title}`)
    return found
}

describe('AboutYouSettings', () => {
    beforeEach(() => {
        mockedProfile.mockReset()
        mockedRebuild.mockReset()
        mockedSaveAbout.mockReset()
        mockedSaveRules.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('shows the profile as Markdown with the date it was written', async () => {
        mockedProfile.mockResolvedValue({content: '## Interests\n\nLoves **jazz**.', updatedAt: '2026-11-02T03:00:00Z', ...NO_INPUT, rebuild: IDLE})
        renderScreen()

        expect(await screen.findByRole('heading', {name: 'Interests'})).toBeInTheDocument()
        expect(screen.getByText('jazz').tagName).toBe('STRONG')
        expect(within(section('Profile')).getByText(/^Updated /)).toBeInTheDocument()
    })

    it('explains when there is no profile yet instead of showing an empty one', async () => {
        mockedProfile.mockResolvedValue({content: null, updatedAt: null, ...NO_INPUT, rebuild: IDLE})
        renderScreen()

        await screen.findByRole('button', {name: /^About me/})
        expect(within(section('Profile')).getByText(/Nothing yet\. Your profile appears/)).toBeInTheDocument()
        expect(within(section('Profile')).queryByText(/^Updated /)).not.toBeInTheDocument()
    })

    it('words a failure for the user and loads again on Try again', async () => {
        mockedProfile
            .mockRejectedValueOnce(new NoteApiError('http', 'profile failed (503)', 503))
            .mockResolvedValueOnce({content: 'Loves jazz.', updatedAt: null, ...NO_INPUT, rebuild: IDLE})
        renderScreen()

        expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
        await userEvent.click(screen.getByRole('button', {name: 'Try again'}))

        expect(await screen.findByText('Loves jazz.')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(mockedProfile).toHaveBeenCalledTimes(2)
    })

    it('shows no error while an expired session goes to sign-in', async () => {
        mockedProfile.mockRejectedValue(new AuthRequiredError())
        renderScreen()

        await vi.waitFor(() => expect(mockedProfile).toHaveBeenCalled())
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('puts the rebuild button and its tries above the profile', async () => {
        mockedProfile.mockResolvedValue({content: '## Interests\n\nJazz.', updatedAt: null, ...NO_INPUT, rebuild: IDLE})
        renderScreen()

        const button = await screen.findByRole('button', {name: 'Rebuild'})
        const heading = screen.getByRole('heading', {name: 'Interests'})
        expect(button.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.getByText(/2 rebuilds left in 30 days/)).toBeInTheDocument()
    })

    it('starts a rebuild only after the confirmation, then shows it running', async () => {
        mockedProfile.mockResolvedValue({content: 'Jazz.', updatedAt: null, ...NO_INPUT, rebuild: {...IDLE, remaining: 1}})
        mockedRebuild.mockResolvedValue({running: true, remaining: 0, availableAt: null})
        renderScreen()

        await userEvent.click(await screen.findByRole('button', {name: 'Rebuild'}))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('1 rebuild left in 30 days')
        await userEvent.click(within(dialog).getByRole('button', {name: 'Not now'}))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockedRebuild).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', {name: 'Rebuild'}))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Rebuild'}))

        expect(await screen.findByRole('button', {name: 'Rebuilding…'})).toBeDisabled()
        expect(screen.getByText('Jazz.')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('reads the profile again while a rebuild runs and shows the new one when it is done', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        mockedProfile
            .mockResolvedValueOnce({content: 'Old profile.', updatedAt: null, ...NO_INPUT, rebuild: {...IDLE, running: true}})
            .mockResolvedValueOnce({content: 'New profile.', updatedAt: null, ...NO_INPUT, rebuild: {...IDLE, remaining: 1}})
        renderScreen()
        expect(await screen.findByText('Old profile.')).toBeInTheDocument()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000)
        })

        expect(await screen.findByText('New profile.')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Rebuild'})).toBeEnabled()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(mockedProfile).toHaveBeenCalledTimes(2)
    })

    it('disables the button and names the date when no rebuilds are left', async () => {
        mockedProfile.mockResolvedValue({
            content: 'Jazz.', updatedAt: null, ...NO_INPUT, rebuild: {running: false, remaining: 0, availableAt: '2026-12-01T10:00:00Z'},
        })
        renderScreen()

        expect(await screen.findByRole('button', {name: 'Rebuild'})).toBeDisabled()
        expect(screen.getByText(/No rebuilds left\. The next one is available on/)).toBeInTheDocument()
    })

    it('words a refusal under the button and takes the server state again', async () => {
        mockedProfile
            .mockResolvedValueOnce({content: 'Jazz.', updatedAt: null, ...NO_INPUT, rebuild: IDLE})
            .mockResolvedValueOnce({
                content: 'Jazz.', updatedAt: null, ...NO_INPUT, rebuild: {running: false, remaining: 0, availableAt: '2026-12-01T10:00:00Z'},
            })
        mockedRebuild.mockRejectedValue(
            new NoteApiError('http', 'profile rebuild failed (429)', 429, undefined, 'PROFILE_REBUILD_LIMIT'),
        )
        renderScreen()

        await userEvent.click(await screen.findByRole('button', {name: 'Rebuild'}))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Rebuild'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('No rebuilds left for now.')
        expect(await screen.findByText(/The next one is available on/)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Rebuild'})).toBeDisabled()
    })

    it('opens on the profile, with the description and rules folded under their hints', async () => {
        mockedProfile.mockResolvedValue(profile({about: 'Designer in Lisbon.', rules: ['No films.', 'Short.']}))
        renderScreen()

        const about = await screen.findByRole('button', {name: /^About me/})
        expect(about).toHaveAttribute('aria-expanded', 'false')
        expect(about).toHaveTextContent('Designer in Lisbon.')
        expect(header('Profile rules')).toHaveTextContent('2 rules')
        expect(header('Profile rules')).toHaveAttribute('aria-expanded', 'false')
        expect(header('Profile')).toHaveAttribute('aria-expanded', 'true')
    })

    it('edits the description, saves it trimmed and shows what the server kept', async () => {
        mockedProfile.mockResolvedValue(profile())
        mockedSaveAbout.mockResolvedValue(profile({about: 'Designer.'}))
        renderScreen()

        await userEvent.click(await screen.findByRole('button', {name: /^About me/}))
        await userEvent.click(within(section('About me')).getByRole('button', {name: 'Edit'}))
        const save = within(section('About me')).getByRole('button', {name: 'Save'})
        expect(save).toBeDisabled() // nothing changed yet
        await userEvent.type(within(section('About me')).getByRole('textbox', {name: 'About me'}), 'Designer.')
        await userEvent.click(save)

        expect(mockedSaveAbout).toHaveBeenCalledWith('Designer.')
        expect(await within(section('About me')).findByText('Designer.')).toBeInTheDocument()
        expect(within(section('About me')).queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('keeps Save off past the limit and gives the saved text back on Cancel', async () => {
        mockedProfile.mockResolvedValue(profile({about: 'Designer.'}))
        renderScreen()

        await userEvent.click(await screen.findByRole('button', {name: /^About me/}))
        await userEvent.click(within(section('About me')).getByRole('button', {name: 'Edit'}))
        const field = within(section('About me')).getByRole('textbox', {name: 'About me'})
        await userEvent.click(field)
        await userEvent.paste('x'.repeat(2_000))
        expect(within(section('About me')).getByRole('button', {name: 'Save'})).toBeDisabled()

        await userEvent.click(within(section('About me')).getByRole('button', {name: 'Cancel'}))
        expect(within(section('About me')).getByText('Designer.')).toBeInTheDocument()
        expect(mockedSaveAbout).not.toHaveBeenCalled()
    })

    it('keeps the typed description when saving fails, with the reason under it', async () => {
        mockedProfile.mockResolvedValue(profile())
        mockedSaveAbout.mockRejectedValue(new NoteApiError('http', 'saving failed (503)', 503))
        renderScreen()

        await userEvent.click(await screen.findByRole('button', {name: /^About me/}))
        await userEvent.click(within(section('About me')).getByRole('button', {name: 'Edit'}))
        await userEvent.type(within(section('About me')).getByRole('textbox', {name: 'About me'}), 'Designer.')
        await userEvent.click(within(section('About me')).getByRole('button', {name: 'Save'}))

        expect(await within(section('About me')).findByRole('alert')).toHaveTextContent('Something went wrong')
        expect(within(section('About me')).getByRole('textbox', {name: 'About me'})).toHaveValue('Designer.')
    })

    it('edits the rules as a list: blank rules hold Save, adding stops at 20, removing drops one', async () => {
        mockedProfile.mockResolvedValue(profile({rules: Array.from({length: 19}, (_, i) => `Rule ${i + 1}.`)}))
        mockedSaveRules.mockResolvedValue(profile({rules: ['Rule 2.'], applyingRules: true}))
        renderScreen()

        await screen.findByRole('button', {name: /^About me/})
        await userEvent.click(header('Profile rules'))
        const rules = section('Profile rules')
        await userEvent.click(within(rules).getByRole('button', {name: 'Edit'}))
        await userEvent.click(within(rules).getByRole('button', {name: 'Add rule'}))
        expect(within(rules).getByRole('button', {name: 'Add rule'})).toBeDisabled()
        expect(within(rules).getByRole('button', {name: 'Save'})).toBeDisabled() // the new rule is blank

        await userEvent.click(within(rules).getByRole('button', {name: 'Remove rule 20'}))
        for (let index = 19; index >= 3; index--) {
            await userEvent.click(within(rules).getByRole('button', {name: `Remove rule ${index}`}))
        }
        await userEvent.click(within(rules).getByRole('button', {name: 'Remove rule 1'}))
        await userEvent.click(within(rules).getByRole('button', {name: 'Save'}))

        expect(mockedSaveRules).toHaveBeenCalledWith(['Rule 2.'])
        expect(await within(section('Profile')).findByText('Applying your rules…')).toBeInTheDocument()
    })

    it('reads the profile again while the rules are applied and stops once they are', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        mockedProfile
            .mockResolvedValueOnce(profile({content: 'Films.', rules: ['No films.'], applyingRules: true}))
            .mockResolvedValueOnce(profile({content: 'Music.', rules: ['No films.']}))
        renderScreen()
        expect(await screen.findByText('Applying your rules…')).toBeInTheDocument()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000)
        })

        expect(await screen.findByText('Music.')).toBeInTheDocument()
        expect(screen.queryByText('Applying your rules…')).not.toBeInTheDocument()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(mockedProfile).toHaveBeenCalledTimes(2)
    })

    it('says applying the rules failed for now, without reading the profile again', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        mockedProfile.mockResolvedValue(profile({rules: ['No films.'], rulesFailed: true}))
        renderScreen()

        expect(await screen.findByText(/Couldn.t apply your rules yet/)).toBeInTheDocument()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(mockedProfile).toHaveBeenCalledTimes(1)
    })

    it('holds Save for an over-long rule and keeps the rules typed when saving them fails', async () => {
        mockedProfile.mockResolvedValue(profile({rules: ['No films.']}))
        mockedSaveRules.mockRejectedValue(new NoteApiError('http', 'saving failed (503)', 503))
        renderScreen()

        await screen.findByRole('button', {name: /^About me/})
        await userEvent.click(header('Profile rules'))
        const rules = section('Profile rules')
        await userEvent.click(within(rules).getByRole('button', {name: 'Edit'}))
        expect(within(rules).getByRole('button', {name: 'Save'})).toBeDisabled() // nothing changed yet
        const rule = within(rules).getByRole('textbox', {name: 'Rule 1'})
        await userEvent.click(rule)
        await userEvent.paste('x'.repeat(300))
        expect(within(rules).getByRole('button', {name: 'Save'})).toBeDisabled()

        await userEvent.clear(rule)
        await userEvent.type(rule, 'No series.')
        await userEvent.click(within(rules).getByRole('button', {name: 'Save'}))

        expect(await within(rules).findByRole('alert')).toHaveTextContent('Something went wrong')
        expect(within(rules).getByRole('textbox', {name: 'Rule 1'})).toHaveValue('No series.')
    })
})
