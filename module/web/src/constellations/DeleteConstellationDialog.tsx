import {useEffect, useState} from 'react'
import {ConstellationPicker, Dialog, Icon, Kicker, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getConstellationDeletion} from './constellationApi'
import {type ConstellationNode, type ConstellationTree, descendantIds, pickerItems} from './constellationTree'
import {constellationsMessages} from './constellations.messages'

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
    /** null target: nothing to move to — a root that, when counted, held no note needing a move. */
    onDelete: (target: DeleteTarget | null) => void
    onCancel: () => void
}) {
    const t = useMessages(constellationsMessages)
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
    const branches = inside.length > 0 ? t.goWithIt(t.subConstellations(inside.length)) : ''
    const title = t.deleteTitle(node.name)

    if (impact.status !== 'ready' || impact.notesToMove === 0) {
        const body = impact.status === 'loading' ? t.counting
            : impact.status === 'error' ? t.countFailed
                : `${branches}${t.notesStay}`
        // The parent still goes along: a note that lost its other places since the count moves there, not nowhere.
        return <Dialog danger title={title} body={error ?? body}
                       confirm={busy ? t.deleting : t.delete} cancel={t.cancel} busy={busy}
                       confirmDisabled={busy || impact.status !== 'ready'}
                       onConfirm={() => onDelete(node.parentId)} onCancel={onCancel}/>
    }

    const targetNode = target && target !== 'none' ? tree.byId.get(target) ?? null : null
    const label = target === 'none' ? t.unplaced : targetNode?.name ?? null
    const body = `${t.holds(node.name, impact.notesToMove)}${branches}` + (label ? t.containerGoes : t.whereMove)
    return (
        <Dialog danger title={title} body={error ?? body} width={340}
                confirm={busy ? t.deleting : t.delete} cancel={t.cancel} busy={busy}
                confirmDisabled={busy || label === null}
                onConfirm={() => target && onDelete(target)} onCancel={onCancel}>
            <div className="constellation-delete-target">
                <button type="button" className="constellation-delete-choice" aria-expanded={picking}
                        onClick={() => setPicking((value) => !value)}>
                    <Kicker size={8.5} spacing="2.2px" color="var(--text-faint)">{t.moveTo}</Kicker>
                    <span className={label ? 'constellation-delete-label' : 'constellation-delete-label empty'}>
                        {label ?? t.choose}
                    </span>
                    <Icon name="chevron" size={11} rotate={picking ? 180 : 0}/>
                </button>
                {picking && <>
                    <ConstellationPicker items={pickerItems(tree)} exclude={[node.id, ...inside]}
                                         label={t.moveNotesTo} action={t.moveThemTo}
                                         onPick={(id) => {
                                             setTarget(id)
                                             setPicking(false)
                                         }}
                                         onClose={() => setPicking(false)}/>
                    <button type="button" className="constellation-delete-leave" onClick={() => {
                        setTarget('none')
                        setPicking(false)
                    }}>{t.leaveUnplaced}
                    </button>
                </>}
                {target === 'none' && <p className="constellation-delete-note">
                    {t.loseTheirPlace}
                </p>}
            </div>
        </Dialog>
    )
}
