import {type ReactNode, useState} from 'react'
import {Icon, IconButton, ListRow} from '@uliss/design-system'
import type {Note} from '../notes/noteApi'
import {formatShortDate} from '../ui/format'

interface NoteBranch {
    note: Note
    children: NoteBranch[]
}

/** Nests [notes] by `parentNoteId`, keeping their order; a note whose parent is not listed stays on top. */
export function nestNotes(notes: Note[]): NoteBranch[] {
    const branches = new Map(notes.map((note) => [note.id, {note, children: [] as NoteBranch[]}]))
    const top: NoteBranch[] = []
    for (const branch of branches.values()) {
        const parent = branch.note.parentNoteId ? branches.get(branch.note.parentNoteId) : undefined
        if (parent) parent.children.push(branch)
        else top.push(branch)
    }
    return top
}

const title = (note: Note) => note.title || 'Untitled note'

/** Notes with their sub-notes folded under them; a chevron with the count unfolds one level. */
export function NoteTreeList({notes, onOpen}: { notes: Note[]; onOpen: (noteId: string) => void }) {
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    const toggle = (id: string) => setOpen((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const rows = (branches: NoteBranch[], depth: number): ReactNode[] => branches.flatMap(({note, children}) => {
        const unfolded = open.has(note.id)
        return [
            <div key={note.id} className="note-tree-row" style={{paddingLeft: 4 + depth * 16}}>
                <span className="note-tree-toggle">
                    {children.length > 0 &&
                        <IconButton s={32} aria-expanded={unfolded}
                                    title={`${unfolded ? 'Hide' : 'Show'} ${children.length} sub-note${children.length === 1 ? '' : 's'} of ${title(note)}`}
                                    onClick={() => toggle(note.id)}>
                            <Icon name="chevron" size={10} rotate={unfolded ? 0 : -90}/>
                        </IconButton>}
                </span>
                <ListRow title={title(note)} date={formatShortDate(note.createdAt)} dots={false}
                         meta={children.length > 0 ? <><Icon name="noteDoc" size={12}/>{children.length}</> : undefined}
                         onClick={() => onOpen(note.id)}/>
            </div>,
            ...(unfolded ? rows(children, depth + 1) : []),
        ]
    })

    return <div className="constellation-panel-note-list note-tree">{rows(nestNotes(notes), 0)}</div>
}
