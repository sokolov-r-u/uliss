import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {
    addNoteConstellation,
    ConstellationApiError,
    createConstellation,
    deleteConstellation,
    getConstellationDeletion,
    getSky,
    getNotePlace,
    listConstellations,
    listNoteConstellations,
    moveConstellation,
    moveNoteOut,
    moveNoteUnder,
    removeNoteConstellation,
    setMainNoteConstellation,
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

    it.each([
        ['a negative note count', {...MUSIC, noteCount: -1}],
        ['more own notes than in the subtree', {...MUSIC, noteCount: 1, ownNoteCount: 2}],
        ['a missing own note count', {...MUSIC, ownNoteCount: undefined}],
    ])('refuses a node with %s', async (_, node) => {
        mockedFetch.mockResolvedValue(jsonResponse([node]))

        await expect(listConstellations()).rejects.toMatchObject({kind: 'protocol'})
    })

    it('sends the note place changes to their endpoints and reads the new places back', async () => {
        const places = [{constellationId: 'j', main: true}, {constellationId: 'f', main: false}]
        mockedFetch.mockImplementation(async () => jsonResponse(places))

        expect(await listNoteConstellations('n1')).toEqual(places)
        await addNoteConstellation('n1', 'f')
        await setMainNoteConstellation('n1', 'f', false)
        await removeNoteConstellation('n1', 'j')

        const calls = mockedFetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])
        expect(calls).toEqual([
            ['/note/notes/n1/constellations', undefined, undefined],
            ['/note/notes/n1/constellations', 'POST', JSON.stringify({constellationId: 'f'})],
            ['/note/notes/n1/constellations/main', 'PUT', JSON.stringify({constellationId: 'f', replace: false})],
            ['/note/notes/n1/constellations/j', 'DELETE', undefined],
        ])
    })

    it.each([
        ['two mains', [{constellationId: 'j', main: true}, {constellationId: 'f', main: true}]],
        ['no main', [{constellationId: 'j', main: false}]],
        ['a place without an id', [{constellationId: '', main: true}]],
    ])('refuses note places with %s', async (_, places) => {
        mockedFetch.mockResolvedValue(jsonResponse(places))

        await expect(listNoteConstellations('n1')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('reads the notes a delete has to move and sends the chosen target', async () => {
        mockedFetch.mockResolvedValueOnce(jsonResponse({notesToMove: 2}))
        expect(await getConstellationDeletion('m')).toEqual({notesToMove: 2})

        mockedFetch.mockResolvedValue(new Response(null, {status: 204}))
        await deleteConstellation('m', 'f')
        await deleteConstellation('m', null)

        expect(mockedFetch.mock.calls.slice(1).map(([path]) => path))
            .toEqual(['/note/constellations/m?moveTo=f', '/note/constellations/m'])
    })

    it('reads a note place and sends the moves under and out from under a note', async () => {
        const place = {ancestors: [{id: 'bowie', title: 'Bowie'}, {id: 'draft', title: null}],
            constellations: [{constellationId: 'rock', main: true}]}
        mockedFetch.mockImplementation(async () => jsonResponse(place))

        await expect(getNotePlace('low')).resolves.toEqual({
            ancestors: [{id: 'bowie', title: 'Bowie'}, {id: 'draft'}],
            constellations: [{constellationId: 'rock', main: true}],
        })
        await moveNoteUnder('low', 'bowie')
        await moveNoteOut('low', 'films')
        await moveNoteOut('low', null)

        expect(mockedFetch.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET', init?.body])).toEqual([
            ['/note/notes/low/place', 'GET', undefined],
            ['/note/notes/low/parent', 'PUT', JSON.stringify({parentNoteId: 'bowie'})],
            ['/note/notes/low/parent?moveTo=films', 'DELETE', undefined],
            ['/note/notes/low/parent', 'DELETE', undefined],
        ])
    })

    it('carries the code of a refused move', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({code: 'NOTE_MOVE_CYCLE'}, 409))

        await expect(moveNoteUnder('bowie', 'low')).rejects.toMatchObject({status: 409, code: 'NOTE_MOVE_CYCLE'})
    })

    it('rejects a malformed place', async () => {
        mockedFetch.mockResolvedValueOnce(jsonResponse({ancestors: [{title: 'No id'}], constellations: []}))
        await expect(getNotePlace('low')).rejects.toMatchObject({kind: 'protocol'})
    })

    it('reads the sky: the tree and the stars with their places', async () => {
        mockedFetch.mockResolvedValue(jsonResponse({
            constellations: [MUSIC],
            notes: [
                {id: 'bowie', title: 'Bowie', parentNoteId: null, createdAt: '2026-10-20T10:00:00Z',
                    memberships: [{constellationId: 'm', main: true}]},
                {id: 'low', title: 'Low', parentNoteId: 'bowie', createdAt: '2026-10-20T11:00:00Z', memberships: []},
            ],
        }))

        const sky = await getSky()

        expect(mockedFetch).toHaveBeenCalledWith('/note/sky', {signal: undefined})
        expect(sky.constellations).toEqual([MUSIC])
        expect(sky.notes[0]).toEqual({id: 'bowie', title: 'Bowie', parentNoteId: null,
            createdAt: '2026-10-20T10:00:00Z', memberships: [{constellationId: 'm', main: true}]})
        expect(sky.notes[1].parentNoteId).toBe('bowie')
    })

    it('rejects a malformed sky', async () => {
        const note = {id: 'n', title: 'N', parentNoteId: null, createdAt: '2026-10-20T10:00:00Z', memberships: []}
        for (const body of [
            {constellations: []},
            {constellations: [], notes: [{...note, title: ''}]},
            {constellations: [], notes: [{...note, createdAt: 'yesterday'}]},
            {constellations: [], notes: [{...note, memberships: [{constellationId: 'm', main: false}]}]},
        ]) {
            mockedFetch.mockResolvedValueOnce(jsonResponse(body))
            await expect(getSky()).rejects.toMatchObject({kind: 'protocol'})
        }
    })
})
