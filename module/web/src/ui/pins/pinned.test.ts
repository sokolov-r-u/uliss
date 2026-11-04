import {describe, expect, it, vi} from 'vitest'
import {AuthRequiredError} from '../../auth/apiClient'
import {createPinnedStore} from './pinned'

type Item = { id: string }

function changes() {
    const listeners = new Set<() => void>()
    return {
        subscribe: vi.fn((listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        }),
        fire: () => listeners.forEach((listener) => listener()),
        count: () => listeners.size,
    }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createPinnedStore', () => {
    it('loads once for all its readers and hands them the same items', async () => {
        const load = vi.fn(() => Promise.resolve<Item[]>([{id: 'a'}]))
        const store = createPinnedStore(load, changes().subscribe)

        store.subscribe(() => undefined)
        store.subscribe(() => undefined)
        expect(store.getSnapshot()).toEqual({status: 'loading'})
        await settle()

        expect(load).toHaveBeenCalledOnce()
        expect(store.getSnapshot()).toEqual({status: 'ready', items: [{id: 'a'}]})
    })

    it('refetches on a list change and tells its readers', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce([{id: 'a'}])
            .mockResolvedValueOnce([{id: 'b'}, {id: 'a'}])
        const events = changes()
        const store = createPinnedStore<Item>(load, events.subscribe)
        const reader = vi.fn()
        store.subscribe(reader)
        await settle()

        events.fire()
        await settle()

        expect(store.getSnapshot()).toEqual({status: 'ready', items: [{id: 'b'}, {id: 'a'}]})
        expect(reader).toHaveBeenCalledTimes(2)
    })

    it('keeps the shown items when a refetch fails, and reports a first failed load', async () => {
        const events = changes()
        const kept = createPinnedStore<Item>(vi.fn()
            .mockResolvedValueOnce([{id: 'a'}])
            .mockRejectedValueOnce(new Error('down')), events.subscribe)
        kept.subscribe(() => undefined)
        await settle()
        events.fire()
        await settle()
        expect(kept.getSnapshot()).toEqual({status: 'ready', items: [{id: 'a'}]})

        const failed = createPinnedStore<Item>(vi.fn().mockRejectedValue(new Error('down')), changes().subscribe)
        failed.subscribe(() => undefined)
        await settle()
        expect(failed.getSnapshot()).toEqual({status: 'error'})
    })

    it('leaves a signed-out load to the auth flow instead of reporting an error', async () => {
        const store = createPinnedStore<Item>(vi.fn().mockRejectedValue(new AuthRequiredError()), changes().subscribe)

        store.subscribe(() => undefined)
        await settle()

        expect(store.getSnapshot()).toEqual({status: 'loading'})
    })

    it('an older answer arriving after a newer request is dropped', async () => {
        let resolveFirst: (items: Item[]) => void = () => undefined
        const load = vi.fn()
            .mockImplementationOnce(() => new Promise<Item[]>((resolve) => {
                resolveFirst = resolve
            }))
            .mockResolvedValueOnce([{id: 'new'}])
        const events = changes()
        const store = createPinnedStore<Item>(load, events.subscribe)
        store.subscribe(() => undefined)

        events.fire()
        await settle()
        resolveFirst([{id: 'old'}])
        await settle()

        expect(store.getSnapshot()).toEqual({status: 'ready', items: [{id: 'new'}]})
    })

    it('stops listening when the last reader goes and loads afresh for the next one', async () => {
        const load = vi.fn(() => Promise.resolve<Item[]>([{id: 'a'}]))
        const events = changes()
        const store = createPinnedStore(load, events.subscribe)
        const stop = store.subscribe(() => undefined)
        await settle()

        stop()
        expect(events.count()).toBe(0)
        expect(store.getSnapshot()).toEqual({status: 'loading'})

        store.subscribe(() => undefined)
        await settle()
        expect(load).toHaveBeenCalledTimes(2)
    })
})
