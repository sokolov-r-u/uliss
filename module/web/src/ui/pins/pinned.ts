import {useSyncExternalStore} from 'react'
import {AuthRequiredError} from '../../auth/apiClient'
import {type Chat, listPinnedChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {listPinnedNotes, type Note, subscribeToNotesChanges} from '../../notes/noteApi'

/** How many chats, and separately how many notes, a user may pin (the note service refuses one more). */
export const PIN_LIMIT = 15

export type PinKind = 'chat' | 'note'

/** `loading` only before the first answer: a refetch keeps the shown items until the new ones arrive. */
export type PinnedState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] }

export interface PinnedStore<T> {
    subscribe: (listener: () => void) => () => void
    getSnapshot: () => PinnedState<T>
    /** Fetches again now, e.g. after a pin failed because another tab filled the list. */
    refresh: () => void
}

/**
 * One shared copy of the pinned list per kind: the side nav, the list screen and every row menu read the same items
 * through [usePinned], so a screen of rows makes one request, not one per row. It loads when the first reader mounts,
 * refetches on the kind's list-change events and is dropped when the last reader goes.
 */
export function createPinnedStore<T>(
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

/** The ids of the pinned items of [kind]; empty until the list has loaded. */
export function usePinnedIds(kind: PinKind): { ids: ReadonlySet<string>; full: boolean } {
    const store = pinnedStore(kind) as PinnedStore<{ id: string }>
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
    const items = state.status === 'ready' ? state.items : []
    return {ids: new Set(items.map((item) => item.id)), full: items.length >= PIN_LIMIT}
}
