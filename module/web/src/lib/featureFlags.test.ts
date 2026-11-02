import {act, renderHook, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {fetchFeatureFlags, useFeatureFlag} from './featureFlags'

vi.mock('../auth/apiClient', () => ({authFetch: vi.fn()}))

const mockedFetch = vi.mocked(authFetch)

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

describe('featureFlags', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('keeps only the flags that are on', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({'note-resummarize': true, other: false, odd: 'yes'}))

        await expect(fetchFeatureFlags()).resolves.toEqual({'note-resummarize': true})
        expect(mockedFetch).toHaveBeenCalledWith('/user/users/me/features', {signal: undefined})
    })

    it('turns a flag on once it is loaded', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({'note-resummarize': true}))

        const {result} = renderHook(() => useFeatureFlag('note-resummarize'))

        expect(result.current).toBe(false)
        await waitFor(() => expect(result.current).toBe(true))
    })

    it('keeps every flag off when the request fails, whatever its body says', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({'note-resummarize': true}, 500))

        const {result} = renderHook(() => useFeatureFlag('note-resummarize'))

        await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
        // let the response and any state update settle before looking
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(result.current).toBe(false)
    })

    it('keeps every flag off when the response is not an object', async () => {
        mockedFetch.mockResolvedValue(jsonResponse(['note-resummarize']))

        await expect(fetchFeatureFlags()).rejects.toThrow('invalid feature flags response')
    })
})
