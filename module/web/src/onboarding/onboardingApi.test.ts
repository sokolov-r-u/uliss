import {afterEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {OnboardingSubmitError, submit} from './onboardingApi'

vi.mock('../auth/apiClient', async (importOriginal) => ({
    ...await importOriginal<typeof import('../auth/apiClient')>(),
    authFetch: vi.fn(),
}))

describe('submit', () => {
    afterEach(() => vi.mocked(authFetch).mockReset())

    it('treats a step that is no longer pending (409, a double submit) as done', async () => {
        vi.mocked(authFetch).mockResolvedValue(new Response('{"code":"ONBOARDING_STEP_NOT_PENDING"}', {status: 409}))

        await expect(submit({command: 'SET_DISPLAY_NAME', displayName: 'Ann'})).resolves.toBeUndefined()
    })

    it('reports any other refusal as a submit error', async () => {
        vi.mocked(authFetch).mockResolvedValue(new Response('{"code":"VALIDATION_FAILED"}', {status: 400}))

        await expect(submit({command: 'SET_DISPLAY_NAME', displayName: ''})).rejects.toBeInstanceOf(OnboardingSubmitError)
    })
})
