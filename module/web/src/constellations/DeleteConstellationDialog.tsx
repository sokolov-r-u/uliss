import {useEffect, useState} from 'react'
import {ConstellationPicker, Dialog, Icon, Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getConstellationDeletion} from './constellationApi'
import {type ConstellationNode, type ConstellationTree, descendantIds, pickerItems, plural} from './constellationTree'

/** Where the notes of a deleted branch go: a constellation id, or nowhere. */
export type DeleteTarget = string | 'none'

type Impact = { status: 'loading' } | { status: 'error' } | { status: 'ready'; notesToMove: number }

/**
 * Deleting a branch. Notes are never deleted: those with no place outside the branch move to a target — the parent by
 * default; a root has none, so Delete waits for a choice. The last, muted choice leaves them without a constellation.
 */
export function DeleteConstellationDialog({node, tree, busy, error, onDelete, onCancel}: {
    node: ConstellationNode
    tree: ConstellationTree
    busy: boolean
    /** The last failed delete. */
    error: string | null
    /** null target: no note needs a move. */
    onDelete: (target: DeleteTarget | null) => void
    onCancel: () => void
}) {
    const [impact, setImpact] = useState<Impact>({status: 'loading'})
    const [target, setTarget] = useState<DeleteTarget | null>(node.parentId)
    const [picking, setPicking] = useState(false)

    useEffect(() => {
        const controller = new AbortController()
        getConstellationDeletion(node.id, controller.signal)
            .then(({notesToMove}) => setImpact({status: 'ready', notesToMove}))
            .catch((e) => {
                if (!controller.signal.aborted && !(e instanceof AuthRequiredError)) setImpact({status: 'error'})
            })
        return () => controller.abort()
    }, [node.id])

    const inside = descendantIds(node)
    const branches = inside.length > 0
        ? `Its ${plural(inside.length, 'sub-constellation', 'sub-constellations')} go with it. `
        : ''
    const title = `Delete “${node.name}”?`

    if (impact.status !== 'ready' || impact.notesToMove === 0) {
        const body = impact.status === 'loading' ? 'Counting the notes…'
            : impact.status === 'error' ? 'Could not count the notes in this branch. Close and try again.'
                : `${branches}Notes are never deleted with a constellation.`
        return <Dialog danger title={title} body={error ?? body}
                       confirm={busy ? 'Deleting…' : 'Delete'} cancel="Cancel" busy={busy}
                       confirmDisabled={busy || impact.status !== 'ready'}
                       onConfirm={() => onDelete(null)} onCancel={onCancel}/>
    }

    const targetNode = target && target !== 'none' ? tree.byId.get(target) ?? null : null
    const label = target === 'none' ? 'Without constellation' : targetNode?.name ?? null
    const notes = plural(impact.notesToMove, 'note', 'notes')
    const body = `${node.name} holds ${notes} with no other place. ${branches}`
        + (label ? 'The notes stay; only the container goes.' : 'Where should they move?')
    return (
        <Dialog danger title={title} body={error ?? body} width={340}
                confirm={busy ? 'Deleting…' : 'Delete'} cancel="Cancel" busy={busy}
                confirmDisabled={busy || label === null}
                onConfirm={() => target && onDelete(target)} onCancel={onCancel}>
            <div className="constellation-delete-target">
                <button type="button" className="constellation-delete-choice" aria-expanded={picking}
                        onClick={() => setPicking((value) => !value)}>
                    <Kicker size={8.5} spacing="2.2px" color="var(--text-faint)">Move to</Kicker>
                    <span className={label ? 'constellation-delete-label' : 'constellation-delete-label empty'}>
                        {label ?? 'Choose'}
                    </span>
                    <Icon name="chevron" size={11} rotate={picking ? 180 : 0}/>
                </button>
                {picking && <>
                    <ConstellationPicker items={pickerItems(tree)} exclude={[node.id, ...inside]}
                                         label="Move the notes to…"
                                         onPick={(id) => {
                                             setTarget(id)
                                             setPicking(false)
                                         }}
                                         onClose={() => setPicking(false)}/>
                    <button type="button" className="constellation-delete-leave" onClick={() => {
                        setTarget('none')
                        setPicking(false)
                    }}>Leave them without a constellation
                    </button>
                </>}
                {target === 'none' && <p className="constellation-delete-note">
                    They lose their place and wait under Without constellation until you place them again.
                </p>}
            </div>
        </Dialog>
    )
}
