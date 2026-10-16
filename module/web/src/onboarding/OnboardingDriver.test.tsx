import {StrictMode} from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {onOnboardingRequired, refreshSession} from '../auth/apiClient'
import {fetchPending, type OnboardingCode, submit} from './onboardingApi'
import {OnboardingDriver} from './OnboardingDriver'

vi.mock('./onboardingApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./onboardingApi')>()
    return {...actual, fetchPending: vi.fn(), submit: vi.fn()}
})

vi.mock('../auth/apiClient', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth/apiClient')>()
    return {...actual, refreshSession: vi.fn(), onOnboardingRequired: vi.fn(() => () => undefined)}
})

const displayName = {code: 'SET_DISPLAY_NAME' as const, blocking: true, status: 'PENDING'}
const profile = {code: 'COMPLETE_PROFILE' as const, blocking: false, status: 'PENDING'}

/** The listener the driver registered for `403 ONBOARDING_REQUIRED`. */
function onboardingRequiredListener(): () => void {
    const calls = vi.mocked(onOnboardingRequired).mock.calls
    return calls[calls.length - 1][0]
}

async function completeDisplayName() {
    fireEvent.change(await screen.findByRole('textbox', {name: 'Display name'}), {target: {value: 'Ann'}})
    fireEvent.click(screen.getByRole('button', {name: 'Continue'}))
}

describe('OnboardingDriver', () => {
    beforeEach(() => {
        vi.mocked(fetchPending).mockReset()
        vi.mocked(submit).mockReset().mockResolvedValue(undefined)
        vi.mocked(refreshSession).mockReset().mockResolvedValue(undefined)
        vi.mocked(onOnboardingRequired).mockClear()
    })

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

    it('keeps blocking when the steps fail to load and loads them again on retry', async () => {
        vi.mocked(fetchPending).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([displayName])

        render(<OnboardingDriver/>)

        fireEvent.click(await screen.findByRole('button', {name: 'Try again'}))
        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
        expect(fetchPending).toHaveBeenCalledTimes(2)
    })

    it('refreshes the session once the last blocking step is done', async () => {
        vi.mocked(fetchPending).mockResolvedValue([displayName, profile])

        render(<OnboardingDriver/>)
        await completeDisplayName()

        expect(await screen.findByText('Gender')).toBeInTheDocument()
        expect(refreshSession).toHaveBeenCalledOnce()
    })

    it('does not refresh the session after an optional step', async () => {
        vi.mocked(fetchPending).mockResolvedValue([profile])

        render(<OnboardingDriver/>)
        const [skip] = await screen.findAllByRole('button', {name: 'Skip for now'})
        fireEvent.click(skip)

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(refreshSession).not.toHaveBeenCalled()
    })

    it('shows onboarding again when a service refuses the user until it is done', async () => {
        vi.mocked(fetchPending).mockResolvedValueOnce([]).mockResolvedValueOnce([displayName])

        render(<OnboardingDriver/>)
        await waitFor(() => expect(fetchPending).toHaveBeenCalledOnce())
        act(() => onboardingRequiredListener()())

        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
    })

    it('refreshes a stale session when a service refuses the user but nothing blocking is left', async () => {
        vi.mocked(fetchPending).mockResolvedValue([])

        render(<OnboardingDriver/>)
        await waitFor(() => expect(fetchPending).toHaveBeenCalledOnce())
        act(() => onboardingRequiredListener()())

        await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce())
    })
})
