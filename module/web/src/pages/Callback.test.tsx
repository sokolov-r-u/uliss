import {render, screen, waitFor} from '@testing-library/react'
import {StrictMode} from 'react'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {exchangeCode, LoginRejectedError, retryLoginOnce, takeReturnTo} from '../auth/authApi'
import {Callback} from './Callback'

const syncFromStore = vi.fn()
vi.mock('../auth/AuthContext', () => ({useAuth: () => ({syncFromStore})}))
vi.mock('../auth/authApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth/authApi')>()
    return {...actual, exchangeCode: vi.fn(), login: vi.fn(), retryLoginOnce: vi.fn(), takeReturnTo: vi.fn()}
})

function renderCallback(query: string) {
    render(<StrictMode>
        <MemoryRouter initialEntries={[`/callback${query}`]}><Routes>
            <Route path="/callback" element={<Callback/>}/>
            <Route path="/notes" element={<div data-testid="return-route"/>}/>
        </Routes></MemoryRouter>
    </StrictMode>)
}

describe('Callback', () => {
    beforeEach(() => {
        vi.mocked(exchangeCode).mockReset()
        vi.mocked(takeReturnTo).mockReset().mockReturnValue('/notes')
        vi.mocked(retryLoginOnce).mockReset().mockReturnValue(false)
        syncFromStore.mockReset()
        sessionStorage.clear()
    })

    it('exchanges the code once, even under StrictMode, and returns to the saved route', async () => {
        vi.mocked(exchangeCode).mockResolvedValue({accessToken: 'a', refreshToken: 'r', expiresAt: 1})

        renderCallback('?code=c1&state=s1')

        expect(await screen.findByTestId('return-route')).toBeInTheDocument()
        expect(exchangeCode).toHaveBeenCalledTimes(1)
        expect(exchangeCode).toHaveBeenCalledWith('c1', 's1')
        expect(syncFromStore).toHaveBeenCalled()
    })

    it('reports a refused or cancelled sign-in without exchanging anything', async () => {
        renderCallback('?error=access_denied&state=s1')

        expect(await screen.findByText(/sign-in was cancelled or refused/i)).toBeInTheDocument()
        expect(exchangeCode).not.toHaveBeenCalled()
    })

    it.each([
        ['without state', '?code=c1'],
        ['without code', '?state=s1'],
        ['with an empty query', ''],
    ])('reports an incomplete sign-in link %s', async (_, query) => {
        renderCallback(query)

        expect(await screen.findByText(/sign-in link is incomplete/i)).toBeInTheDocument()
        expect(exchangeCode).not.toHaveBeenCalled()
    })

    it('restarts a rejected login once instead of showing an error', async () => {
        vi.mocked(exchangeCode).mockRejectedValue(new LoginRejectedError())
        vi.mocked(retryLoginOnce).mockReturnValue(true)

        renderCallback('?code=c1&state=s1')

        await waitFor(() => expect(retryLoginOnce).toHaveBeenCalledOnce())
        expect(screen.queryByText(/sign-in session has expired/i)).not.toBeInTheDocument()
    })

    it('asks to start again when the restarted login is rejected too', async () => {
        vi.mocked(exchangeCode).mockRejectedValue(new LoginRejectedError())

        renderCallback('?code=c1&state=s1')

        expect(await screen.findByText(/sign-in session has expired/i)).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'try again'})).toBeInTheDocument()
    })

    it('reports any other failure as a generic sign-in error', async () => {
        vi.mocked(exchangeCode).mockRejectedValue(new Error('token exchange failed (503)'))

        renderCallback('?code=c1&state=s1')

        await waitFor(() => expect(screen.getByText(/could not complete sign-in/i)).toBeInTheDocument())
    })

    // the flag allows one automatic restart; a finished login, good or failed, must give the next one its own
    describe('ends the login retry window', () => {
        const RETRIED = 'uliss.loginRetried'

        beforeEach(() => sessionStorage.setItem(RETRIED, '1'))

        it('after a completed login', async () => {
            vi.mocked(exchangeCode).mockResolvedValue({accessToken: 'a', refreshToken: 'r', expiresAt: 1})

            renderCallback('?code=c1&state=s1')

            expect(await screen.findByTestId('return-route')).toBeInTheDocument()
            expect(sessionStorage.getItem(RETRIED)).toBeNull()
        })

        it('after a failure that is not a rejected login', async () => {
            vi.mocked(exchangeCode).mockRejectedValue(new Error('token exchange failed (502)'))

            renderCallback('?code=c1&state=s1')

            expect(await screen.findByText(/could not complete sign-in/i)).toBeInTheDocument()
            expect(sessionStorage.getItem(RETRIED)).toBeNull()
        })

        it('after a refused sign-in', async () => {
            renderCallback('?error=access_denied&state=s1')

            expect(await screen.findByText(/sign-in was cancelled or refused/i)).toBeInTheDocument()
            expect(sessionStorage.getItem(RETRIED)).toBeNull()
        })
    })
})
