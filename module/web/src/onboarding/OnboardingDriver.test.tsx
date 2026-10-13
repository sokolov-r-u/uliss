import {StrictMode} from 'react'
import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {fetchPending} from './onboardingApi'
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
})
