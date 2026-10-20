import {useEffect, useState} from 'react'
import {Button, Icon, IconButton, Kicker} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteDetailsSections} from '../notes/NoteDetailsSections'
import {getNote, type Note} from '../notes/noteApi'
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
 * The picked star's panel: the note's title, the start of its text and Open note, then everything the open note's
 * details panel holds — where it lives (with all of its place actions), its sub-notes, the chats it came from and its
 * dates. A change of place redraws the sky; a sub-note opens its own panel here.
 */
export function SkyStarPanel({graph, starId, onClose, onOpen, onPickStar, onOpenChat, onChanged}: {
    graph: SkyGraph
    starId: string
    onClose: () => void
    onOpen: (id: string) => void
    onPickStar: (id: string) => void
    onOpenChat: (chatId: string) => void
    onChanged: () => void
}) {
    const star = graph.byId.get(starId)
    const [loaded, setLoaded] = useState<{ id: string; note: Note | null } | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        getNote(starId, controller.signal)
            .then((note) => setLoaded({id: starId, note}))
            .catch((error: unknown) => {
                if (error instanceof AuthRequiredError || controller.signal.aborted) return
                setLoaded({id: starId, note: null})
            })
        return () => controller.abort()
    }, [starId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    if (!star) return null
    const note = loaded?.id === starId ? loaded.note : undefined

    return <aside className="sky-panel" data-sky-ui="" aria-label="Note">
        <header className="sky-panel-head">
            <Kicker size={9} spacing="3px" color="var(--accent)">Note</Kicker>
            <IconButton s={44} title="Close" onClick={onClose}><Icon name="close" size={15}/></IconButton>
        </header>
        <div className="sky-panel-body">
            <h2 className="sky-panel-title">{star.label}</h2>
            <p className="sky-panel-excerpt">{note === undefined ? 'Loading…'
                : note ? plainExcerpt(note.content) : 'Could not load the note.'}</p>
            <Button variant="outline" onClick={() => onOpen(star.id)}>Open note</Button>
            {note && <div className="sky-panel-details">
                <NoteDetailsSections note={note} onOpenNote={(id) => graph.byId.has(id) ? onPickStar(id) : onOpen(id)}
                                     onOpenChat={onOpenChat} onPlaceChanged={onChanged}/>
            </div>}
        </div>
    </aside>
}
