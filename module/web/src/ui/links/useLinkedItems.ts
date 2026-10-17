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
): { items: T[]; reload: () => void } {
    const [loaded, setLoaded] = useState<{ id: string; items: T[] }>({id, items: []})
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
                if (!controller.signal.aborted) setLoaded({id, items})
            })
            .catch(() => undefined)
        return () => controller.abort()
        // `load` is a module-level API function.
    }, [id, revision])

    return {items: loaded.id === id ? loaded.items : [], reload}
}
