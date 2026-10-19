import {useEffect, useState} from 'react'
import {Button, ConstellationChip, constellationColor, Icon, IconButton, Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getNote} from '../notes/noteApi'
import type {SkyGraph} from './skyModel'

/** Markdown reduced to one plain line for a preview: headings, emphasis, links and list marks dropped. */
export function plainExcerpt(markdown: string | null): string {
    if (!markdown) return ''
    return markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!?\[([^\]]*)]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
        .replace(/[*_`~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * The picked star's panel: the note's title, where it lives (the main constellation's path and the other places as
 * chips, or the path through its parent notes), the start of its text and Open note.
 */
export function SkyStarPanel({graph, starId, onClose, onOpen}: {
    graph: SkyGraph
    starId: string
    onClose: () => void
    onOpen: (id: string) => void
}) {
    const star = graph.byId.get(starId)
    const [text, setText] = useState<{ id: string; excerpt: string } | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        getNote(starId, controller.signal)
            .then((note) => setText({id: starId, excerpt: plainExcerpt(note.content)}))
            .catch((error: unknown) => {
                if (error instanceof AuthRequiredError || controller.signal.aborted) return
                setText({id: starId, excerpt: ''})
            })
        return () => controller.abort()
    }, [starId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    if (!star) return null
    const parents: string[] = []
    for (let id = star.parentId; id; id = graph.byId.get(id)?.parentId ?? null) {
        const node = graph.byId.get(id)
        if (node?.kind !== 'star') break
        parents.unshift(node.label)
    }
    const [mainId, ...otherIds] = star.constellationIds
    const main = mainId ? graph.tree.byId.get(mainId) : undefined
    const path = [...(main ? [...main.ancestors.map((a) => a.name), main.name] : []), ...parents]
    const loading = text?.id !== starId

    return <aside className="sky-panel" data-sky-ui="" aria-label="Note">
        <header className="sky-panel-head">
            <Kicker size={9} spacing="3px" color="var(--accent)">Note</Kicker>
            <IconButton s={44} title="Close" onClick={onClose}><Icon name="close" size={15}/></IconButton>
        </header>
        <div className="sky-panel-body">
            <h2 className="sky-panel-title">{star.label}</h2>
            <div className="sky-panel-place">
                {path.length > 0
                    ? <span className="sky-panel-path">{path.join(' › ')}</span>
                    : <span className="sky-panel-path muted">Without constellation</span>}
                {parents.length === 0 && otherIds.map((id) => {
                    const node = graph.tree.byId.get(id)
                    return node ? <ConstellationChip key={id} label={node.name} size="sm"
                                                     color={constellationColor(node.hue, node.lightness)}/> : null
                })}
            </div>
            <p className="sky-panel-excerpt">{loading ? 'Loading…' : text?.excerpt}</p>
            <Button variant="outline" onClick={() => onOpen(star.id)}>Open note</Button>
        </div>
    </aside>
}
