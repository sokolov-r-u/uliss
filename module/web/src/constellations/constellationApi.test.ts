import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {
    ConstellationApiError,
    createConstellation,
    deleteConstellation,
    listConstellations,
    moveConstellation,
    updateConstellation,
} from './constellationApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

const MUSIC = {id: 'm', parentId: null, name: 'Music', hue: 264, lightness: 'BASE', noteCount: 0, ownNoteCount: 0}

describe('constellationApi', () => {
    beforeEach(() => mockedFetch.mockReset())

    it('lists the flat tree', async () => {
        mockedFetch.mockResolvedValue(jsonResponse([MUSIC, {...MUSIC, id: 'j', parentId: 'm', name: 'Jazz', lightness: 'LIGHT'}]))

        const items = await listConstellations()

        expect(items.map((item) => [item.id, item.parentId, item.lightness])).toEqual([['m', null, 'BASE'], ['j', 'm', 'LIGHT']])
        expect(mockedFetch).toHaveBeenCalledWith('/note/constellations', {signal: undefined})
    })

    it.each([
        ['an unknown lightness', {...MUSIC, lightness: 'DIM'}],
        ['a hue out of range', {...MUSIC, hue: 360}],
        ['a missing name', {...MUSIC, name: ''}],
    ])('refuses a node with %s', async (_, node) => {
        mockedFetch.mockResolvedValue(jsonResponse([node]))

        await expect(listConstellations()).rejects.toMatchObject({kind: 'protocol'})
    })

    it('sends create, patch and move bodies to their endpoints', async () => {
        mockedFetch.mockImplementation(async () => jsonResponse(MUSIC))

        await createConstellation('Music', null)
        await updateConstellation('m', {hue: 22})
        await moveConstellation('m', 'f')

        const calls = mockedFetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])
        expect(calls).toEqual([
            ['/note/constellations', 'POST', JSON.stringify({name: 'Music', parentId: null})],
            ['/note/constellations/m', 'PATCH', JSON.stringify({hue: 22})],
            ['/note/constellations/m/move', 'POST', JSON.stringify({parentId: 'f'})],
        ])
    })

    it('carries the status and the service code of a refusal', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({code: 'CONSTELLATION_NAME_TAKEN'}, 409))

        const error = await createConstellation('music', null).catch((e: unknown) => e)

        expect(error).toBeInstanceOf(ConstellationApiError)
        expect(error).toMatchObject({kind: 'http', status: 409, code: 'CONSTELLATION_NAME_TAKEN'})
    })

    it('reads a refusal without a JSON body as one without a code', async () => {
        mockedFetch.mockResolvedValue(new Response('<html>bad gateway</html>', {status: 502}))

        await expect(deleteConstellation('m')).rejects.toMatchObject({status: 502, code: undefined})
    })

    it('reports an unreachable service as a transport failure and lets sign-in failures through', async () => {
        mockedFetch.mockRejectedValueOnce(new TypeError('network down'))
        await expect(listConstellations()).rejects.toMatchObject({kind: 'transport'})

        const authError = new AuthRequiredError()
        mockedFetch.mockRejectedValueOnce(authError)
        await expect(listConstellations()).rejects.toBe(authError)
    })
})
