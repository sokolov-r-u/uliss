import {useCallback, useEffect, useRef, useState} from 'react'
import {AuthRequiredError} from '../../auth/apiClient'

/** A page of a server list ordered newest first; `nextCursor` is null on the last page. */
export interface KeysetListPage<T> {
    items: T[]
    nextCursor: string | null
    /** The size of the whole list, when the server counts it. */
    total?: number
}

export type MoreState = 'idle' | 'loading' | 'failed'

export type KeysetListState<T> =
    | { status: 'loading' }
    | { status: 'error'; error: unknown }
    | { status: 'ready'; items: T[]; hasMore: boolean; more: MoreState; total?: number }

type Loaded<T> = Extract<KeysetListState<T>, { status: 'ready' }>

/**
 * Loads a keyset-paged list: the first page on mount and on every [revision] change, the next one on [loadMore].
 * A reload replaces the list with a fresh first page and keeps the old rows on screen meanwhile; a failed reload of a
 * shown list keeps them too. Pages are joined without repeats: an item changed between two requests can come twice.
 */
export function useKeysetList<T extends { id: string }>(
    load: (cursor: string | undefined, signal: AbortSignal) => Promise<KeysetListPage<T>>,
    revision: number,
) {
    const [state, setState] = useState<KeysetListState<T>>({status: 'loading'})
    const cursorRef = useRef<string | null>(null)
    // a page requested before the latest reload belongs to an outdated list
    const generationRef = useRef(0)
    const moreRef = useRef<AbortController | null>(null)
    const loadRef = useRef(load)
    loadRef.current = load

    useEffect(() => {
        const generation = ++generationRef.current
        moreRef.current?.abort()
        const controller = new AbortController()
        setState((current) => current.status === 'error' ? {status: 'loading'} : current)
        loadRef.current(undefined, controller.signal)
            .then((page) => {
                if (generation !== generationRef.current) return
                cursorRef.current = page.nextCursor
                setState({status: 'ready', items: unique(page.items), hasMore: page.nextCursor !== null, more: 'idle',
                    total: page.total})
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || error instanceof AuthRequiredError) return
                setState((current) => current.status === 'ready' ? current : {status: 'error', error})
            })
        return () => controller.abort()
    }, [revision])

    const loadMore = useCallback(() => {
        const cursor = cursorRef.current
        if (cursor === null || moreRef.current) return
        const generation = generationRef.current
        const controller = new AbortController()
        moreRef.current = controller
        setState((current) => current.status === 'ready' ? {...current, more: 'loading'} : current)
        loadRef.current(cursor, controller.signal)
            .then((page) => {
                if (generation !== generationRef.current) return
                cursorRef.current = page.nextCursor
                setState((current) => current.status !== 'ready' ? current : {
                    status: 'ready',
                    items: unique([...current.items, ...page.items]),
                    hasMore: page.nextCursor !== null,
                    more: 'idle',
                    total: page.total ?? current.total,
                })
            })
            .catch((error: unknown) => {
                if (generation !== generationRef.current || error instanceof AuthRequiredError) return
                setState((current) => current.status === 'ready' ? {...current, more: 'failed'} : current)
            })
            .finally(() => {
                if (moreRef.current === controller) moreRef.current = null
            })
    }, [])

    /** Changes the shown rows in place, e.g. after a rename or a delete made here. */
    const update = useCallback((change: (current: Loaded<T>) => Loaded<T>) => {
        setState((current) => current.status === 'ready' ? change(current) : current)
    }, [])

    return {state, loadMore, update}
}

function unique<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    return items.filter((item) => !seen.has(item.id) && seen.add(item.id))
}
