import {act, renderHook, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {PinnedState} from '../ui/pins/pinned'
import {listPinnedNotes, type Note} from './noteApi'
import {useFilteredPinned} from './useFilteredPinned'

vi.mock('./noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./noteApi')>()
    return {...actual, listPinnedNotes: vi.fn()}
})

const note = (id: string) => ({id, source: 'MANUAL', status: 'READY', title: id, content: 'x'}) as Note
const ready = (...ids: string[]): PinnedState<Note> => ({status: 'ready', items: ids.map(note)})
const ids = (state: PinnedState<Note>) => state.status === 'ready' ? state.items.map((item) => item.id) : state.status

type Props = { filter: string[]; revision: number; all: PinnedState<Note> }

function renderPinned(initialProps: Props) {
    return renderHook(({filter, revision, all}: Props) => useFilteredPinned(filter, revision, all), {initialProps})
}

describe('useFilteredPinned', () => {
    beforeEach(() => vi.mocked(listPinnedNotes).mockReset())

    it('is the shared pinned list without a filter and fetches nothing', () => {
        const all = ready('a', 'b')
        const {result} = renderPinned({filter: [], revision: 0, all})

        expect(result.current.state).toBe(all)
        expect(listPinnedNotes).not.toHaveBeenCalled()
    })

    it('waits for the shared pinned list before it asks for the filter\'s, so it asks once', async () => {
        vi.mocked(listPinnedNotes).mockResolvedValue([note('song')])
        const {result, rerender} = renderPinned({filter: ['music'], revision: 0, all: {status: 'loading'}})
        expect(result.current.state.status).toBe('loading')
        expect(listPinnedNotes).not.toHaveBeenCalled()

        rerender({filter: ['music'], revision: 0, all: ready('song', 'film')})

        await waitFor(() => expect(ids(result.current.state)).toEqual(['song']))
        expect(listPinnedNotes).toHaveBeenCalledTimes(1)
    })

    it('never shows the pinned notes of the previous filter while the new ones load', async () => {
        let resolveFilms: (notes: Note[]) => void = () => undefined
        vi.mocked(listPinnedNotes)
            .mockResolvedValueOnce([note('song')])
            .mockReturnValueOnce(new Promise((resolve) => {
                resolveFilms = resolve
            }))
        const {result, rerender} = renderPinned({filter: ['music'], revision: 0, all: ready('song', 'film')})
        await waitFor(() => expect(ids(result.current.state)).toEqual(['song']))

        rerender({filter: ['films'], revision: 0, all: ready('song', 'film')})
        expect(result.current.state.status).toBe('loading')
        await act(async () => resolveFilms([note('film')]))

        expect(ids(result.current.state)).toEqual(['film'])
        expect(listPinnedNotes).toHaveBeenLastCalledWith(expect.any(AbortSignal), ['films'])
    })

    it('refetches on a change event and on a pin anywhere, keeping the shown items when that fails', async () => {
        vi.mocked(listPinnedNotes)
            .mockResolvedValueOnce([note('song')])
            .mockResolvedValueOnce([note('new'), note('song')])
            .mockRejectedValueOnce(new Error('offline'))
        const {result, rerender} = renderPinned({filter: ['music'], revision: 0, all: ready('song')})
        await waitFor(() => expect(ids(result.current.state)).toEqual(['song']))

        rerender({filter: ['music'], revision: 0, all: ready('new', 'song')})
        await waitFor(() => expect(ids(result.current.state)).toEqual(['new', 'song']))
        rerender({filter: ['music'], revision: 1, all: ready('new', 'song')})

        await waitFor(() => expect(listPinnedNotes).toHaveBeenCalledTimes(3))
        expect(ids(result.current.state)).toEqual(['new', 'song'])
    })

    it('reports a failed first fetch and fetches again on retry', async () => {
        vi.mocked(listPinnedNotes).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([note('song')])
        const {result} = renderPinned({filter: ['music'], revision: 0, all: ready('song')})
        await waitFor(() => expect(result.current.state.status).toBe('error'))

        act(() => result.current.retry())

        await waitFor(() => expect(ids(result.current.state)).toEqual(['song']))
    })
})
