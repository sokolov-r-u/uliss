import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {NoteApiError} from '../notes/noteApi'
import {getProfile, rebuildProfile, saveAbout, saveRules} from './profileApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

const IDLE = {running: false, remaining: 2, availableAt: null}
const NO_INPUT = {about: null, rules: [], applyingRules: false, rulesFailed: false}

describe('getProfile', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
    })

    it('reads the profile, its date and rebuild state, and treats a missing or blank text as none yet', async () => {
        mockedFetch.mockResolvedValueOnce(
            json({content: '## Interests\nJazz.', updatedAt: '2026-11-02T03:00:00Z', rebuild: IDLE}),
        )
        await expect(getProfile()).resolves.toEqual(
            {content: '## Interests\nJazz.', updatedAt: '2026-11-02T03:00:00Z', rebuild: IDLE, ...NO_INPUT},
        )
        expect(mockedFetch.mock.calls[0][0]).toBe('/note/profile')

        const spent = {running: true, remaining: 0, availableAt: '2026-12-01T10:00:00Z'}
        mockedFetch.mockResolvedValueOnce(json({content: null, updatedAt: null, rebuild: spent}))
        await expect(getProfile()).resolves.toEqual({content: null, updatedAt: null, rebuild: spent, ...NO_INPUT})

        mockedFetch.mockResolvedValueOnce(json({content: '  ', updatedAt: '', rebuild: IDLE}))
        await expect(getProfile()).resolves.toEqual({content: null, updatedAt: null, rebuild: IDLE, ...NO_INPUT})
    })

    it('reads the user\'s description, rules and whether they are being applied or failed', async () => {
        mockedFetch.mockResolvedValueOnce(json({
            content: 'Jazz.', updatedAt: null, rebuild: IDLE,
            about: 'Designer.', rules: ['No films.', 3, 'Short.'], applyingRules: true, rulesFailed: false,
        }))

        await expect(getProfile()).resolves.toMatchObject(
            {about: 'Designer.', rules: ['No films.', 'Short.'], applyingRules: true, rulesFailed: false},
        )
    })

    it('treats a body without a valid rebuild state as a protocol failure', async () => {
        mockedFetch.mockResolvedValueOnce(json({content: 'Jazz.', updatedAt: null}))
        await expect(getProfile()).rejects.toMatchObject({kind: 'protocol'})

        mockedFetch.mockResolvedValueOnce(json({content: 'Jazz.', updatedAt: null, rebuild: {running: 'no', remaining: 2}}))
        await expect(getProfile()).rejects.toMatchObject({kind: 'protocol'})
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

describe('rebuildProfile', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
    })

    it('posts the rebuild and returns the state the server reports', async () => {
        mockedFetch.mockResolvedValueOnce(json({running: true, remaining: 1, availableAt: null}, 202))

        await expect(rebuildProfile()).resolves.toEqual({running: true, remaining: 1, availableAt: null})
        expect(mockedFetch.mock.calls[0][0]).toBe('/note/profile/rebuild')
        expect(mockedFetch.mock.calls[0][1]).toMatchObject({method: 'POST'})
    })

    it('fails a refusal with its status and the service code, so the screen can word it', async () => {
        mockedFetch.mockResolvedValueOnce(json({code: 'PROFILE_REBUILD_RUNNING'}, 409))
        await expect(rebuildProfile()).rejects.toMatchObject({kind: 'http', status: 409, code: 'PROFILE_REBUILD_RUNNING'})

        mockedFetch.mockResolvedValueOnce(
            json({code: 'PROFILE_REBUILD_LIMIT', details: {availableAt: '2026-12-01T10:00:00Z'}}, 429),
        )
        await expect(rebuildProfile()).rejects.toMatchObject({kind: 'http', status: 429, code: 'PROFILE_REBUILD_LIMIT'})

        mockedFetch.mockRejectedValueOnce(new TypeError('network down'))
        await expect(rebuildProfile()).rejects.toMatchObject({kind: 'transport'})
    })
})

describe('saveAbout and saveRules', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
    })

    it('put the trimmed text, a blank one as none, and return the profile the server answers with', async () => {
        const saved = {content: null, updatedAt: null, rebuild: IDLE, ...NO_INPUT, about: 'Designer.'}
        mockedFetch.mockImplementation(() => Promise.resolve(json(saved)))

        await expect(saveAbout('  Designer.  ')).resolves.toEqual(saved)
        expect(mockedFetch.mock.calls[0][0]).toBe('/note/profile/about')
        expect(mockedFetch.mock.calls[0][1]).toMatchObject({method: 'PUT', body: JSON.stringify({about: 'Designer.'})})

        await saveAbout('   ')
        expect(mockedFetch.mock.calls[1][1]).toMatchObject({body: JSON.stringify({about: null})})
    })

    it('put the whole list of rules trimmed, in order', async () => {
        mockedFetch.mockResolvedValueOnce(json({content: null, updatedAt: null, rebuild: IDLE, ...NO_INPUT}))

        await saveRules([' No films. ', 'Short.'])

        expect(mockedFetch.mock.calls[0][0]).toBe('/note/profile/rules')
        expect(mockedFetch.mock.calls[0][1]).toMatchObject(
            {method: 'PUT', body: JSON.stringify({rules: ['No films.', 'Short.']})},
        )
    })

    it('fail a refused save with its status', async () => {
        mockedFetch.mockResolvedValueOnce(json({code: 'VALIDATION_ERROR'}, 400))
        await expect(saveRules(['x'])).rejects.toMatchObject({kind: 'http', status: 400})

        mockedFetch.mockRejectedValueOnce(new TypeError('network down'))
        await expect(saveAbout('x')).rejects.toMatchObject({kind: 'transport'})
    })
})
