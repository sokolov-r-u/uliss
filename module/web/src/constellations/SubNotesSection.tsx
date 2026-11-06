import {ListRow, useMessages} from '@uliss/design-system'
import {listSubNotes, subscribeToNotesChanges} from '../notes/noteApi'
import {PanelSection} from '../ui/ContextPanel'
import {formatShortDate} from '../ui/format'
import {useLinkedItems} from '../ui/links/useLinkedItems'
import {useLocale} from '@uliss/design-system'
import {commonMessages} from '../i18n/common.messages'
import {constellationsMessages} from './constellations.messages'

const SUBSCRIPTIONS = [subscribeToNotesChanges]

/** "Sub-notes" of a note's panel: its direct sub-notes as rows that open them; no section while there are none. */
export function SubNotesSection({noteId, onOpen}: { noteId: string; onOpen: (noteId: string) => void }) {
    const locale = useLocale()
    const t = useMessages(constellationsMessages)
    const common = useMessages(commonMessages)
    const {items: notes} = useLinkedItems(noteId, listSubNotes, SUBSCRIPTIONS)
    if (notes.length === 0) return null
    return (
        <PanelSection label={t.subNotes} count={notes.length}>
            <div className="context-links">
                {notes.map((note) => (
                    <ListRow key={note.id} title={note.title || common.untitledNote} icon={note.icon ?? null} date={formatShortDate(note.createdAt, locale)}
                             dots={false} onClick={() => onOpen(note.id)}/>
                ))}
            </div>
        </PanelSection>
    )
}
