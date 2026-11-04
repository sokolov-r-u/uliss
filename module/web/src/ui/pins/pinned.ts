import {useSyncExternalStore} from 'react'
import {AuthRequiredError} from '../../auth/apiClient'
import {type Chat, listPinnedChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {listPinnedNotes, type Note, subscribeToNotesChanges} from '../../notes/noteApi'

/** How many chats, and separately how many notes, a user may pin (the note service refuses one more). */
export const PIN_LIMIT = 15

export type PinKind = 'chat' | 'note'

/** `loading` only before the first answer: a refetch keeps the shown items until the new ones arrive. */
export type PinnedState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] }

export interface PinnedStore<T extends { id: string }> {
    subscribe: (listener: () => void) => () => void
    getSnapshot: () => PinnedState<T>
    /** Fetches again now, e.g. on Retry after a failed load. */
    refresh: () => void
    /**
     * Shows a just pinned item at once, before the refetch that follows the pin confirms it: on top when new, in its
     * place when it was pinned already (the service keeps that place).
     */
    addPinned: (item: T) => void
}

/**
 * One shared copy of the pinned list per kind: the side nav, the list screen and every row menu read the same items
 * through [usePinned], so a screen of rows makes one request, not one per row. It loads when the first reader mounts,
 * refetches on the kind's list-change events and is dropped when the last reader goes.
 */
export function createPinnedStore<T extends { id: string }>(
    load: (signal: AbortSignal) => Promise<T[]>,
    subscribeToChanges: (listener: () => void) => () => void,
): PinnedStore<T> {
    let state: PinnedState<T> = {status: 'loading'}
    const listeners = new Set<() => void>()
    let controller: AbortController | null = null
    let stopWatching: (() => void) | null = null

    const set = (next: PinnedState<T>) => {
        state = next
        listeners.forEach((listener) => listener())
    }

    const refresh = () => {
        controller?.abort()
        const current = new AbortController()
        controller = current
        load(current.signal)
            .then((items) => {
                if (!current.signal.aborted) set({status: 'ready', items})
            })
            .catch((error) => {
                if (current.signal.aborted || error instanceof AuthRequiredError) return
                // a failed refetch keeps the items already shown
                if (state.status !== 'ready') set({status: 'error'})
            })
    }

    return {
        subscribe(listener) {
            listeners.add(listener)
            if (listeners.size === 1) {
                stopWatching = subscribeToChanges(refresh)
                refresh()
            }
            return () => {
                listeners.delete(listener)
                if (listeners.size > 0) return
                stopWatching?.()
                stopWatching = null
                controller?.abort()
                controller = null
                state = {status: 'loading'}
            }
        },
        getSnapshot: () => state,
        refresh,
        addPinned(item) {
            if (state.status !== 'ready') return
            const known = state.items.some((other) => other.id === item.id)
            set({status: 'ready', items: known
                ? state.items.map((other) => other.id === item.id ? item : other)
                : [item, ...state.items]})
        },
    }
}

export const pinnedChats = createPinnedStore<Chat>(listPinnedChats, subscribeToChatListChanges)
export const pinnedNotes = createPinnedStore<Note>(listPinnedNotes, subscribeToNotesChanges)

export function pinnedStore(kind: PinKind): PinnedStore<Chat> | PinnedStore<Note> {
    return kind === 'chat' ? pinnedChats : pinnedNotes
}

export function usePinnedChats(): PinnedState<Chat> {
    return useSyncExternalStore(pinnedChats.subscribe, pinnedChats.getSnapshot)
}

export function usePinnedNotes(): PinnedState<Note> {
    return useSyncExternalStore(pinnedNotes.subscribe, pinnedNotes.getSnapshot)
}

/** The ids of the pinned items of [kind]; `ready` is false until the list has loaded (or after it failed to). */
export function usePinnedIds(kind: PinKind): { ready: boolean; ids: ReadonlySet<string>; full: boolean } {
    const store = pinnedStore(kind)
    const getSnapshot: () => PinnedState<{ id: string }> = store.getSnapshot
    const state = useSyncExternalStore(store.subscribe, getSnapshot)
    const items = state.status === 'ready' ? state.items : []
    return {ready: state.status === 'ready', ids: new Set(items.map((item) => item.id)), full: items.length >= PIN_LIMIT}
}

/** [items] without the pinned ones: a page fetched before a pin landed must not show the item a second time. */
export function withoutPinned<T extends { id: string }>(items: T[], pinned: readonly { id: string }[]): T[] {
    if (pinned.length === 0) return items
    const ids = new Set(pinned.map((item) => item.id))
    return items.filter((item) => !ids.has(item.id))
}
