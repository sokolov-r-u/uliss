import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {login} from '../auth/authApi'
import {SignedOut} from './SignedOut'

vi.mock('../auth/authApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../auth/authApi')>(),
    login: vi.fn(),
}))

describe('SignedOut', () => {
    it("does not sign in by itself; signing in again is the reader's choice", async () => {
        render(<SignedOut/>)

        expect(screen.getByText('You are signed out of Uliss on this device.')).toBeInTheDocument()
        expect(login).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', {name: 'sign in'}))
        expect(login).toHaveBeenCalledOnce()
    })
})
