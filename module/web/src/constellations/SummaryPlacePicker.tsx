import {useCallback, useEffect, useMemo, useState} from 'react'
import {Button, ConstellationPicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {type Constellation, ConstellationApiError, createConstellation, listConstellations} from './constellationApi'
import {buildConstellationTree, pickerItems} from './constellationTree'
import {placementFailureMessage} from './NoteConstellationSection'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Constellation[] }

/**
 * The place of a chat's first summary note: the shared tree picker, which can also create a constellation where the
 * user stands. Its action button starts the summary; a new [revision] reloads the tree (a picked branch was deleted).
 */
export function SummaryPlacePicker({busy, revision, onPick, onClose}: {
    busy: boolean
    revision: number
    onPick: (constellationId: string) => void
    onClose: () => void
}) {
    const [load, setLoad] = useState<LoadState>({status: 'loading'})
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async (signal?: AbortSignal) => {
        try {
            const items = await listConstellations(signal)
            setLoad({status: 'ready', items})
        } catch (e) {
            if (e instanceof AuthRequiredError || signal?.aborted) return
            setLoad({status: 'error'})
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        void reload(controller.signal)
        return () => controller.abort()
    }, [reload, revision])

    /** Creates a constellation for the picker, which then selects it; the summary starts only from the action. */
    async function createIn(name: string, parentId: string | null): Promise<string | undefined> {
        setError(null)
        try {
            const created = await createConstellation(name, parentId)
            const fresh = await listConstellations().catch(() => null)
            setLoad((current) => current.status === 'ready'
                ? {status: 'ready', items: fresh ?? [...current.items, created]}
                : current)
            return created.id
        } catch (e) {
            if (e instanceof ConstellationApiError && e.status === 404) {
                // The branch to create in was deleted elsewhere: there is no note yet, so say so and refresh the tree.
                setError('That constellation no longer exists. Pick another place.')
                void reload()
            } else if (!(e instanceof AuthRequiredError)) {
                setError(placementFailureMessage(e, name))
            }
            throw e
        }
    }

    const items = useMemo(
        () => load.status === 'ready' ? pickerItems(buildConstellationTree(load.items)) : [],
        [load],
    )

    if (load.status === 'loading') return <p className="context-text">Loading the constellations…</p>
    if (load.status === 'error') {
        return <div className="note-places-state">
            <p className="context-text">Could not load the constellations.</p>
            <Button size="sm" variant="quiet" onClick={() => {
                setLoad({status: 'loading'})
                void reload()
            }}>Retry</Button>
        </div>
    }
    return <>
        <ConstellationPicker items={items} label="Put the note in…" action={(name) => `Summarize into ${name}`}
                             busy={busy} onPick={(id) => {
                                 setError(null)
                                 onPick(id)
                             }} onCreate={createIn} onClose={onClose}/>
        {error && <p className="note-places-error" role="alert">{error}</p>}
    </>
}
