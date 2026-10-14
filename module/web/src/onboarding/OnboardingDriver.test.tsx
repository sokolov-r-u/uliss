import {StrictMode} from 'react'
import {act, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {fetchPending, type OnboardingCode} from './onboardingApi'
import {OnboardingDriver} from './OnboardingDriver'

vi.mock('./onboardingApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./onboardingApi')>()
    return {...actual, fetchPending: vi.fn()}
})

describe('OnboardingDriver', () => {
    it('shows the pending step under StrictMode (effects run twice in development)', async () => {
        vi.mocked(fetchPending).mockResolvedValue([{code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'}])

        render(<StrictMode><OnboardingDriver/></StrictMode>)

        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
    })

    it('skips a step code this client does not know instead of showing the profile step', async () => {
        vi.mocked(fetchPending).mockResolvedValue([
            {code: 'FUTURE_STEP' as OnboardingCode, blocking: true, status: 'PENDING'},
            {code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'},
        ])

        render(<OnboardingDriver/>)

        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
    })

    it('renders nothing when every pending step is unknown', async () => {
        vi.mocked(fetchPending).mockResolvedValue([
            {code: 'FUTURE_STEP' as OnboardingCode, blocking: true, status: 'PENDING'},
        ])

        render(<OnboardingDriver/>)

        await waitFor(() => expect(fetchPending).toHaveBeenCalled())
        await act(async () => undefined)
        expect(screen.queryByText('Gender')).not.toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})
