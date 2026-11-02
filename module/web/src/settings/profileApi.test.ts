import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {NoteApiError} from '../notes/noteApi'
import {getProfile} from './profileApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

describe('getProfile', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
    })

    it('reads the profile and its date, and treats a missing or blank one as none yet', async () => {
        mockedFetch.mockResolvedValueOnce(json({content: '## Interests\nJazz.', updatedAt: '2026-11-02T03:00:00Z'}))
        await expect(getProfile()).resolves.toEqual({content: '## Interests\nJazz.', updatedAt: '2026-11-02T03:00:00Z'})
        expect(mockedFetch.mock.calls[0][0]).toBe('/note/profile')

        mockedFetch.mockResolvedValueOnce(json({content: null, updatedAt: null}))
        await expect(getProfile()).resolves.toEqual({content: null, updatedAt: null})

        mockedFetch.mockResolvedValueOnce(json({content: '  ', updatedAt: ''}))
        await expect(getProfile()).resolves.toEqual({content: null, updatedAt: null})
    })

    it('fails as a note-service error the screens already know how to word', async () => {
        mockedFetch.mockResolvedValueOnce(json({}, 503))
        await expect(getProfile()).rejects.toMatchObject({kind: 'http', status: 503})

        mockedFetch.mockRejectedValueOnce(new TypeError('network down'))
        await expect(getProfile()).rejects.toMatchObject({kind: 'transport'})

        mockedFetch.mockResolvedValueOnce(new Response('not json', {status: 200}))
        const error = await getProfile().catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(NoteApiError)
        expect(error).toMatchObject({kind: 'protocol'})
    })

    it('lets an expired session through untouched, so the sign-in redirect handles it', async () => {
        const expired = new AuthRequiredError()
        mockedFetch.mockRejectedValueOnce(expired)

        await expect(getProfile()).rejects.toBe(expired)
    })
})
