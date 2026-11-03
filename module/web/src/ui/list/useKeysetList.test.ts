import {act, renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {type KeysetListPage, useKeysetList} from './useKeysetList'

type Item = { id: string }

const page = (ids: string[], nextCursor: string | null, total?: number): KeysetListPage<Item> =>
    ({items: ids.map((id) => ({id})), nextCursor, total})

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined
    let reject: (error: unknown) => void = () => undefined
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return {promise, resolve, reject}
}

function ready<T>(state: ReturnType<typeof useKeysetList<Item>>['state']) {
    if (state.status !== 'ready') throw new Error(`expected a ready list, was ${state.status}`)
    return state as Extract<typeof state, { status: 'ready' }> & T
}

describe('useKeysetList', () => {
    it('loads the first page, then the next one after the cursor, joining them without repeats', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce(page(['a', 'b'], 'cur-1', 5))
            .mockResolvedValueOnce(page(['b', 'c'], null, 5))
        const {result} = renderHook(() => useKeysetList<Item>(load, 0))

        await waitFor(() => expect(result.current.state.status).toBe('ready'))
        expect(ready(result.current.state).hasMore).toBe(true)
        act(() => result.current.loadMore())

        await waitFor(() => expect(ready(result.current.state).hasMore).toBe(false))
        expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
        expect(ready(result.current.state).total).toBe(5)
        expect(load).toHaveBeenNthCalledWith(1, undefined, expect.any(AbortSignal))
        expect(load).toHaveBeenNthCalledWith(2, 'cur-1', expect.any(AbortSignal))

        act(() => result.current.loadMore())
        expect(load).toHaveBeenCalledTimes(2)
    })

    it('asks for one next page at a time', async () => {
        const next = deferred<KeysetListPage<Item>>()
        const load = vi.fn().mockResolvedValueOnce(page(['a'], 'cur-1')).mockReturnValueOnce(next.promise)
        const {result} = renderHook(() => useKeysetList<Item>(load, 0))
        await waitFor(() => expect(result.current.state.status).toBe('ready'))

        act(() => {
            result.current.loadMore()
            result.current.loadMore()
        })

        expect(ready(result.current.state).more).toBe('loading')
        expect(load).toHaveBeenCalledTimes(2)
        await act(async () => next.resolve(page(['b'], null)))
        expect(ready(result.current.state).more).toBe('idle')
    })

    it('marks a failed next page and loads it again on the next request', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce(page(['a'], 'cur-1'))
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(page(['b'], null))
        const {result} = renderHook(() => useKeysetList<Item>(load, 0))
        await waitFor(() => expect(result.current.state.status).toBe('ready'))

        act(() => result.current.loadMore())
        await waitFor(() => expect(ready(result.current.state).more).toBe('failed'))
        expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['a'])

        act(() => result.current.loadMore())
        await waitFor(() => expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['a', 'b']))
        expect(load).toHaveBeenLastCalledWith('cur-1', expect.any(AbortSignal))
    })

    it('replaces the list with a fresh first page on a new revision and drops a page asked for before it', async () => {
        const stale = deferred<KeysetListPage<Item>>()
        const load = vi.fn()
            .mockResolvedValueOnce(page(['a', 'b'], 'cur-1'))
            .mockReturnValueOnce(stale.promise)
            .mockResolvedValueOnce(page(['b', 'a'], 'cur-2'))
            .mockResolvedValueOnce(page(['c'], null))
        const {result, rerender} = renderHook(({revision}) => useKeysetList<Item>(load, revision),
            {initialProps: {revision: 0}})
        await waitFor(() => expect(result.current.state.status).toBe('ready'))
        act(() => result.current.loadMore())

        rerender({revision: 1})
        await waitFor(() => expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['b', 'a']))
        // the fresh list asks for its next page while the old request is still out
        act(() => result.current.loadMore())
        expect(load).toHaveBeenLastCalledWith('cur-2', expect.any(AbortSignal))
        await act(async () => stale.resolve(page(['old'], null)))

        await waitFor(() => expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['b', 'a', 'c']))
    })

    it('keeps the shown rows when a reload fails', async () => {
        const load = vi.fn().mockResolvedValueOnce(page(['a'], null)).mockRejectedValueOnce(new Error('offline'))
        const {result, rerender} = renderHook(({revision}) => useKeysetList<Item>(load, revision),
            {initialProps: {revision: 0}})
        await waitFor(() => expect(result.current.state.status).toBe('ready'))

        rerender({revision: 1})
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
        await act(async () => undefined)

        expect(ready(result.current.state).items.map((item) => item.id)).toEqual(['a'])
    })

    it('reports a failed first load and loads again from scratch on a new revision', async () => {
        const error = new Error('offline')
        const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(page(['a'], null))
        const {result, rerender} = renderHook(({revision}) => useKeysetList<Item>(load, revision),
            {initialProps: {revision: 0}})
        await waitFor(() => expect(result.current.state).toEqual({status: 'error', error}))

        rerender({revision: 1})

        expect(result.current.state.status).toBe('loading')
        await waitFor(() => expect(result.current.state.status).toBe('ready'))
    })

    it('changes the shown rows in place', async () => {
        const load = vi.fn().mockResolvedValueOnce(page(['a', 'b'], null, 2))
        const {result} = renderHook(() => useKeysetList<Item>(load, 0))
        await waitFor(() => expect(result.current.state.status).toBe('ready'))

        act(() => result.current.update((current) => ({...current, items: current.items.slice(1), total: 1})))

        expect(ready(result.current.state).items).toEqual([{id: 'b'}])
        expect(ready(result.current.state).total).toBe(1)
    })
})
