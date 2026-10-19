import {useCallback, useEffect, useState} from 'react'

type Subscribe = (listener: () => void) => () => void

/**
 * Items linked to [id] (the notes of a chat, the chats of a note), reloaded whenever a [subscriptions] source fires or
 * [reload] is called. Items belong to the id they were loaded for, so another id never shows them; a failed load keeps
 * what is shown for the same id.
 */
export function useLinkedItems<T>(
    id: string,
    load: (id: string, signal: AbortSignal) => Promise<T[]>,
    subscriptions: Subscribe[],
): { items: T[]; reload: () => void; status: 'loading' | 'ready' | 'failed' } {
    const [loaded, setLoaded] = useState<{ id: string; items: T[]; status: 'loading' | 'ready' | 'failed' }>(
        {id, items: [], status: 'loading'})
    const [revision, setRevision] = useState(0)
    const reload = useCallback(() => setRevision((value) => value + 1), [])

    useEffect(() => {
        const unsubscribers = subscriptions.map((subscribe) => subscribe(reload))
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
        // The sources are module-level functions that never change.
    }, [reload])

    useEffect(() => {
        const controller = new AbortController()
        load(id, controller.signal)
            .then((items) => {
                if (!controller.signal.aborted) setLoaded({id, items, status: 'ready'})
            })
            .catch(() => {
                // A failed load keeps what is shown for the same id.
                if (!controller.signal.aborted) {
                    setLoaded((current) => current.id === id ? {...current, status: current.status === 'ready' ? 'ready' : 'failed'}
                        : {id, items: [], status: 'failed'})
                }
            })
        return () => controller.abort()
        // `load` is a module-level API function.
    }, [id, revision])

    return loaded.id === id
        ? {items: loaded.items, reload, status: loaded.status}
        : {items: [], reload, status: 'loading'}
}
