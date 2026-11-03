import {act, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError} from '../notes/noteApi'
import {AboutYouSettings} from './AboutYouSettings'
import {getProfile, rebuildProfile} from './profileApi'

vi.mock('./profileApi', () => ({getProfile: vi.fn(), rebuildProfile: vi.fn()}))

const mockedProfile = vi.mocked(getProfile)
const mockedRebuild = vi.mocked(rebuildProfile)

function renderScreen() {
    render(<MemoryRouter><AboutYouSettings/></MemoryRouter>)
}

const IDLE = {running: false, remaining: 2, availableAt: null}

describe('AboutYouSettings', () => {
    beforeEach(() => {
        mockedProfile.mockReset()
        mockedRebuild.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('shows the profile as Markdown with the date it was written', async () => {
        mockedProfile.mockResolvedValue({content: '## Interests\n\nLoves **jazz**.', updatedAt: '2026-11-02T03:00:00Z', rebuild: IDLE})
        renderScreen()

        expect(await screen.findByRole('heading', {name: 'Interests'})).toBeInTheDocument()
        expect(screen.getByText('jazz').tagName).toBe('STRONG')
        expect(screen.getByText(/^Updated /)).toBeInTheDocument()
    })

    it('explains when there is no profile yet instead of showing an empty one', async () => {
        mockedProfile.mockResolvedValue({content: null, updatedAt: null, rebuild: IDLE})
        renderScreen()

        expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument()
        expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument()
    })

    it('words a failure for the user and loads again on Try again', async () => {
        mockedProfile
            .mockRejectedValueOnce(new NoteApiError('http', 'profile failed (503)', 503))
            .mockResolvedValueOnce({content: 'Loves jazz.', updatedAt: null, rebuild: IDLE})
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
        mockedProfile.mockResolvedValue({content: '## Interests\n\nJazz.', updatedAt: null, rebuild: IDLE})
        renderScreen()

        const button = await screen.findByRole('button', {name: 'Rebuild'})
        const heading = screen.getByRole('heading', {name: 'Interests'})
        expect(button.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.getByText(/2 rebuilds left in 30 days/)).toBeInTheDocument()
    })

    it('starts a rebuild only after the confirmation, then shows it running', async () => {
        mockedProfile.mockResolvedValue({content: 'Jazz.', updatedAt: null, rebuild: {...IDLE, remaining: 1}})
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
            .mockResolvedValueOnce({content: 'Old profile.', updatedAt: null, rebuild: {...IDLE, running: true}})
            .mockResolvedValueOnce({content: 'New profile.', updatedAt: null, rebuild: {...IDLE, remaining: 1}})
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
            content: 'Jazz.', updatedAt: null, rebuild: {running: false, remaining: 0, availableAt: '2026-12-01T10:00:00Z'},
        })
        renderScreen()

        expect(await screen.findByRole('button', {name: 'Rebuild'})).toBeDisabled()
        expect(screen.getByText(/No rebuilds left\. The next one is available on/)).toBeInTheDocument()
    })

    it('words a refusal under the button and takes the server state again', async () => {
        mockedProfile
            .mockResolvedValueOnce({content: 'Jazz.', updatedAt: null, rebuild: IDLE})
            .mockResolvedValueOnce({
                content: 'Jazz.', updatedAt: null, rebuild: {running: false, remaining: 0, availableAt: '2026-12-01T10:00:00Z'},
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
})
