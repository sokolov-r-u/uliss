import {useCallback, useEffect, useRef, useState} from 'react'
import {AuthRequiredError} from '../../auth/apiClient'

/** A page of a server list ordered newest first; `nextCursor` is null on the last page. */
export interface KeysetListPage<T> {
    items: T[]
    nextCursor: string | null
    /** The size of the whole list, when the server counts it. */
    total?: number
    /** The size of the list without its filter, when the server counts it. */
    allTotal?: number
}

export type MoreState = 'idle' | 'loading' | 'failed'

export type KeysetListState<T> =
    | { status: 'loading' }
    | { status: 'error'; error: unknown }
    | { status: 'ready'; items: T[]; hasMore: boolean; more: MoreState; total?: number; allTotal?: number }

type Loaded<T> = Extract<KeysetListState<T>, { status: 'ready' }>

/**
 * Loads a keyset-paged list: the first page on mount and on every [revision] or [listKey] change, the next one on
 * [loadMore]. A reload replaces the list with a fresh first page and keeps the old rows on screen meanwhile, asking for
 * no next page until it ends; a failed reload of the same list keeps them and their cursor. [listKey] names which list
 * is shown (e.g. its filter): when a reload for another key fails, the old rows belong to a different list, so the
 * error shows instead. Pages are joined without repeats: an item changed between two requests can come twice.
 */
export function useKeysetList<T extends { id: string }>(
    load: (cursor: string | undefined, signal: AbortSignal) => Promise<KeysetListPage<T>>,
    revision: number,
    listKey = '',
) {
    const [state, setState] = useState<KeysetListState<T>>({status: 'loading'})
    const cursorRef = useRef<string | null>(null)
    // a page requested before the latest reload belongs to an outdated list
    const generationRef = useRef(0)
    const moreRef = useRef<AbortController | null>(null)
    const reloadingRef = useRef(false)
    const loadRef = useRef(load)
    loadRef.current = load
    // the key of the rows in the state
    const shownKeyRef = useRef<string | null>(null)

    useEffect(() => {
        const generation = ++generationRef.current
        // no next page while the list reloads: the cursor belongs to the list about to be replaced
        reloadingRef.current = true
        moreRef.current?.abort()
        moreRef.current = null
        const controller = new AbortController()
        setState((current) => current.status === 'error' ? {status: 'loading'}
            : current.status === 'ready' ? {...current, more: 'loading'} : current)
        loadRef.current(undefined, controller.signal)
            .then((page) => {
                if (generation !== generationRef.current) return
                reloadingRef.current = false
                cursorRef.current = page.nextCursor
                shownKeyRef.current = listKey
                setState({status: 'ready', items: unique(page.items), hasMore: page.nextCursor !== null, more: 'idle',
                    total: page.total, allTotal: page.allTotal})
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || error instanceof AuthRequiredError) return
                reloadingRef.current = false
                if (shownKeyRef.current !== listKey) {
                    cursorRef.current = null
                    shownKeyRef.current = null
                    setState({status: 'error', error})
                    return
                }
                // the shown list stays, and so does its cursor
                setState((current) => current.status === 'ready' ? {...current, more: 'idle'} : {status: 'error', error})
            })
        return () => controller.abort()
    }, [revision, listKey])

    useEffect(() => () => moreRef.current?.abort(), [])

    const loadMore = useCallback(() => {
        const cursor = cursorRef.current
        if (cursor === null || moreRef.current || reloadingRef.current) return
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
                    allTotal: page.allTotal ?? current.allTotal,
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
