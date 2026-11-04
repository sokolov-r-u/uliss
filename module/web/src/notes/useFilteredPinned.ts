import {useEffect, useRef, useState} from 'react'
import {AuthRequiredError} from '../auth/apiClient'
import type {PinnedState} from '../ui/pins/pinned'
import {listPinnedNotes, type Note} from './noteApi'

/**
 * The pinned notes the Notes page shows: all of them ([all], the shared store) without a filter, else those of the
 * filter, fetched again whenever the filter, [revision] or the shared pinned list changes (a pin or unpin anywhere).
 * [retry] fetches the filtered list again after it failed.
 */
export function useFilteredPinned(filter: readonly string[], revision: number, all: PinnedState<Note>):
    { state: PinnedState<Note>; retry: () => void } {
    const filterKey = filter.join(',')
    const allKey = all.status === 'ready' ? all.items.map((note) => note.id).join(',') : all.status
    const [attempt, setAttempt] = useState(0)
    // the filter the shown state belongs to: the state of another filter is never shown
    const [loaded, setLoaded] = useState<{ key: string; state: PinnedState<Note> }>({key: '', state: {status: 'loading'}})
    const filterRef = useRef(filter)
    filterRef.current = filter

    useEffect(() => {
        if (filterKey === '') return
        const controller = new AbortController()
        listPinnedNotes(controller.signal, filterRef.current)
            .then((items) => setLoaded({key: filterKey, state: {status: 'ready', items}}))
            .catch((error: unknown) => {
                if (controller.signal.aborted || error instanceof AuthRequiredError) return
                // a failed refetch of the same filter keeps the items already shown
                setLoaded((current) => current.key === filterKey && current.state.status === 'ready'
                    ? current : {key: filterKey, state: {status: 'error'}})
            })
        return () => controller.abort()
    }, [filterKey, revision, allKey, attempt])

    const retry = () => setAttempt((value) => value + 1)
    if (filterKey === '') return {state: all, retry}
    return {state: loaded.key === filterKey ? loaded.state : {status: 'loading'}, retry}
}
