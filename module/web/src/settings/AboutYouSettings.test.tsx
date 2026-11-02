import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError} from '../notes/noteApi'
import {AboutYouSettings} from './AboutYouSettings'
import {getProfile} from './profileApi'

vi.mock('./profileApi', () => ({getProfile: vi.fn()}))

const mockedProfile = vi.mocked(getProfile)

function renderScreen() {
    render(<MemoryRouter><AboutYouSettings/></MemoryRouter>)
}

describe('AboutYouSettings', () => {
    beforeEach(() => {
        mockedProfile.mockReset()
    })

    it('shows the profile as Markdown with the date it was written', async () => {
        mockedProfile.mockResolvedValue({content: '## Interests\n\nLoves **jazz**.', updatedAt: '2026-11-02T03:00:00Z'})
        renderScreen()

        expect(await screen.findByRole('heading', {name: 'Interests'})).toBeInTheDocument()
        expect(screen.getByText('jazz').tagName).toBe('STRONG')
        expect(screen.getByText(/^Updated /)).toBeInTheDocument()
    })

    it('explains when there is no profile yet instead of showing an empty one', async () => {
        mockedProfile.mockResolvedValue({content: null, updatedAt: null})
        renderScreen()

        expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument()
        expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument()
    })

    it('words a failure for the user and loads again on Try again', async () => {
        mockedProfile
            .mockRejectedValueOnce(new NoteApiError('http', 'profile failed (503)', 503))
            .mockResolvedValueOnce({content: 'Loves jazz.', updatedAt: null})
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
})
