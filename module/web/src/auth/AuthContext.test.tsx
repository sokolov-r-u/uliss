import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {logout as revokeAndClear} from './authApi'
import {AuthProvider, useAuth} from './AuthContext'
import {getTokens, setTokens} from './tokenStore'

vi.mock('./authApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('./authApi')>(),
    logout: vi.fn(),
}))

function SignOut() {
    const {logout} = useAuth()
    return <button type="button" onClick={() => void logout()}>Sign out</button>
}

/** Another tab of this browser: its own channel object on the same name. */
const otherTab = () => new BroadcastChannel('uliss.auth')

describe('AuthProvider', () => {
    let assign: ReturnType<typeof vi.fn>

    beforeEach(() => {
        sessionStorage.clear()
        assign = vi.fn()
        vi.stubGlobal('location', {...window.location, assign})
        setTokens({accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000, idToken: 'i'})
    })
    afterEach(() => vi.unstubAllGlobals())

    it('signs out through the end-session address and tells the other tabs', async () => {
        vi.mocked(revokeAndClear).mockResolvedValue('https://auth/connect/logout?id_token_hint=i')
        const tab = otherTab()
        const heard = vi.fn()
        tab.onmessage = (event) => heard(event.data)
        render(<AuthProvider><SignOut/></AuthProvider>)

        await userEvent.click(screen.getByRole('button', {name: 'Sign out'}))

        expect(revokeAndClear).toHaveBeenCalledWith('r', 'i')
        expect(assign).toHaveBeenCalledWith('https://auth/connect/logout?id_token_hint=i')
        await waitFor(() => expect(heard).toHaveBeenCalledWith('signed-out'))
        tab.close()
    })

    it('falls back to the signed-out page when there is no end-session address', async () => {
        vi.mocked(revokeAndClear).mockResolvedValue(null)
        render(<AuthProvider><SignOut/></AuthProvider>)

        await userEvent.click(screen.getByRole('button', {name: 'Sign out'}))

        expect(assign).toHaveBeenCalledWith('/signed-out')
    })

    it('drops its own tokens and leaves when another tab signs out', async () => {
        render(<AuthProvider><SignOut/></AuthProvider>)
        const tab = otherTab()

        act(() => tab.postMessage('signed-out'))

        await waitFor(() => expect(assign).toHaveBeenCalledWith('/signed-out'))
        expect(getTokens()).toBeNull()
        tab.close()
    })

    it("stays put on another tab's sign-out when it holds no tokens", async () => {
        sessionStorage.clear()
        render(<AuthProvider><SignOut/></AuthProvider>)
        const tab = otherTab()
        const probe = otherTab()
        const delivered = new Promise((resolve) => {
            probe.onmessage = resolve
        })

        tab.postMessage('signed-out')
        await delivered
        // the provider's channel got the same message in the same delivery round
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

        expect(assign).not.toHaveBeenCalled()
        tab.close()
        probe.close()
    })
})
