import {NoteConstellationSection} from '../constellations/NoteConstellationSection'
import {SubNotesSection} from '../constellations/SubNotesSection'
import {PanelFact, PanelSection} from '../ui/ContextPanel'
import {formatFullDate} from '../ui/format'
import {NoteChatsList} from '../ui/links/NoteChatsList'
import type {Note} from './noteApi'
import {useLocale, useMessages} from '@uliss/design-system'
import {notesMessages} from './notes.messages'
import {NotePosterSection} from './poster/NotePosterSection'

/**
 * Everything a note's details panel says about it: its poster, where it lives (Constellation), its sub-notes, the chats it was
 * written from and its dates. Shared by the open note's panel and the sky's star panel.
 */
export function NoteDetailsSections({note, onOpenNote, onOpenChat, onPlaceChanged, onPosterChanged}: {
    note: Note
    onOpenNote: (noteId: string) => void
    onOpenChat: (chatId: string) => void
    /** A change of the note's place or of the tree was stored. */
    onPlaceChanged?: () => void
    /** The note's poster link was stored or removed: the owner shows [note] with it. */
    onPosterChanged: (posterUrl: string | undefined) => void
}) {
    const locale = useLocale()
    const t = useMessages(notesMessages)
    return <>
        <NotePosterSection key={note.id} note={note} onChanged={onPosterChanged}/>
        <PanelSection label={t.constellation}>
            <NoteConstellationSection key={note.id} noteId={note.id} noteTitle={note.title} noteIcon={note.icon}
                                      onChanged={onPlaceChanged}/>
        </PanelSection>
        <SubNotesSection noteId={note.id} onOpen={onOpenNote}/>
        <PanelSection label={t.writtenFrom}>
            <NoteChatsList noteId={note.id} onOpen={onOpenChat}
                           empty={<p className="context-text">
                               {note.source === 'CHAT_SUMMARY' ? t.chatSummary : t.byHand}</p>}/>
        </PanelSection>
        <PanelSection label={t.dates}>
            <PanelFact label={t.written} value={formatFullDate(note.createdAt, locale) || '—'}/>
            <PanelFact label={t.updated} value={formatFullDate(note.updatedAt ?? note.createdAt, locale) || '—'}/>
        </PanelSection>
    </>
}
