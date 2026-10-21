import {StrictMode} from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {onOnboardingRequired, refreshSession, tokenRequiresOnboarding} from '../auth/apiClient'
import {notifyChatListChanged} from '../chat/chatApi'
import {notifyNotesChanged} from '../notes/noteApi'
import {fetchPending, type OnboardingCode, submit} from './onboardingApi'
import {OnboardingDriver} from './OnboardingDriver'

vi.mock('./onboardingApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./onboardingApi')>()
    return {...actual, fetchPending: vi.fn(), submit: vi.fn()}
})

vi.mock('../auth/apiClient', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth/apiClient')>()
    return {
        ...actual,
        refreshSession: vi.fn(),
        onOnboardingRequired: vi.fn(() => () => undefined),
        tokenRequiresOnboarding: vi.fn(),
    }
})

vi.mock('../chat/chatApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../chat/chatApi')>(),
    notifyChatListChanged: vi.fn(),
}))

vi.mock('../notes/noteApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../notes/noteApi')>(),
    notifyNotesChanged: vi.fn(),
}))

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
        vi.mocked(tokenRequiresOnboarding).mockReset().mockReturnValue(true)
        vi.mocked(notifyChatListChanged).mockClear()
        vi.mocked(notifyNotesChanged).mockClear()
    })

    it('shows the pending step under StrictMode (effects run twice in development)', async () => {
        vi.mocked(fetchPending).mockResolvedValue([{code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'}])

        render(<StrictMode><OnboardingDriver/></StrictMode>)

        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
    })

    it('skips a step code this client does not know instead of showing the profile step', async () => {
        vi.mocked(fetchPending).mockResolvedValue([
            {code: 'FUTURE_STEP' as OnboardingCode, blocking: false, status: 'PENDING'},
            {code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'},
        ])

        render(<OnboardingDriver/>)

        expect(await screen.findByRole('textbox', {name: 'Display name'})).toBeInTheDocument()
    })

    it('renders nothing when every pending step is unknown and optional', async () => {
        vi.mocked(fetchPending).mockResolvedValue([
            {code: 'FUTURE_STEP' as OnboardingCode, blocking: false, status: 'PENDING'},
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

    it('asks to try again instead of reloading the lists when the stale session cannot be refreshed', async () => {
        vi.mocked(fetchPending).mockResolvedValue([])
        vi.mocked(refreshSession).mockRejectedValueOnce(new Error('auth down'))

        render(<OnboardingDriver/>)
        await waitFor(() => expect(fetchPending).toHaveBeenCalledOnce())
        act(() => onboardingRequiredListener()())

        fireEvent.click(await screen.findByRole('button', {name: 'Try again'}))
        await waitFor(() => expect(fetchPending).toHaveBeenCalledTimes(3))
        expect(notifyChatListChanged).not.toHaveBeenCalled()
        expect(notifyNotesChanged).not.toHaveBeenCalled()
        // the retry is a plain reload: nothing was refused since, so no second refresh
        expect(refreshSession).toHaveBeenCalledOnce()
    })

    it('lets an onboarded user in when the steps fail to load', async () => {
        vi.mocked(tokenRequiresOnboarding).mockReturnValue(false)
        vi.mocked(fetchPending).mockRejectedValue(new Error('user-service down'))

        render(<OnboardingDriver/>)

        await waitFor(() => expect(fetchPending).toHaveBeenCalled())
        await act(async () => undefined)
        expect(screen.queryByRole('button', {name: 'Try again'})).not.toBeInTheDocument()
    })

    it('blocks after a refusal even when the token has no onboarding claim', async () => {
        vi.mocked(tokenRequiresOnboarding).mockReturnValue(false)
        vi.mocked(fetchPending).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'))

        render(<OnboardingDriver/>)
        await waitFor(() => expect(fetchPending).toHaveBeenCalledOnce())
        act(() => onboardingRequiredListener()())

        expect(await screen.findByRole('button', {name: 'Try again'})).toBeInTheDocument()
    })

    it('asks to reload when a blocking step is unknown to this client', async () => {
        vi.mocked(fetchPending).mockResolvedValue([
            {code: 'FUTURE_STEP' as OnboardingCode, blocking: true, status: 'PENDING'},
        ])

        render(<OnboardingDriver/>)

        expect(await screen.findByRole('button', {name: 'Reload'})).toBeInTheDocument()
    })

    it('reloads the chat and note lists refused before the session was refreshed', async () => {
        vi.mocked(fetchPending).mockResolvedValue([displayName])

        render(<OnboardingDriver/>)
        await completeDisplayName()

        await waitFor(() => expect(notifyChatListChanged).toHaveBeenCalledOnce())
        expect(notifyNotesChanged).toHaveBeenCalledOnce()
    })

    it('keeps the steps reloaded while the session was refreshing', async () => {
        let finishRefresh: () => void = () => undefined
        vi.mocked(refreshSession).mockImplementationOnce(() => new Promise((resolve) => {
            finishRefresh = () => resolve()
        }))
        vi.mocked(fetchPending).mockResolvedValueOnce([displayName]).mockResolvedValueOnce([profile])

        render(<OnboardingDriver/>)
        await completeDisplayName()
        await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce())
        act(() => onboardingRequiredListener()())
        expect(await screen.findByText('Gender')).toBeInTheDocument()
        await act(async () => finishRefresh())

        expect(screen.getByText('Gender')).toBeInTheDocument()
    })
})
