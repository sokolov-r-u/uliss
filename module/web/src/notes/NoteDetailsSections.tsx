import {NoteConstellationSection} from '../constellations/NoteConstellationSection'
import {SubNotesSection} from '../constellations/SubNotesSection'
import {PanelFact, PanelSection} from '../ui/ContextPanel'
import {formatFullDate} from '../ui/format'
import {NoteChatsList} from '../ui/links/NoteChatsList'
import type {Note} from './noteApi'

/**
 * Everything a note's details panel says about it: where it lives (Constellation), its sub-notes, the chats it was
 * written from and its dates. Shared by the open note's panel and the sky's star panel.
 */
export function NoteDetailsSections({note, onOpenNote, onOpenChat, onPlaceChanged}: {
    note: Note
    onOpenNote: (noteId: string) => void
    onOpenChat: (chatId: string) => void
    /** A change of the note's place or of the tree was stored. */
    onPlaceChanged?: () => void
}) {
    return <>
        <PanelSection label="Constellation">
            <NoteConstellationSection noteId={note.id} noteTitle={note.title} noteIcon={note.icon}
                                      onChanged={onPlaceChanged}/>
        </PanelSection>
        <SubNotesSection noteId={note.id} onOpen={onOpenNote}/>
        <PanelSection label="Written from">
            <NoteChatsList noteId={note.id} onOpen={onOpenChat}
                           empty={<p className="context-text">
                               {note.source === 'CHAT_SUMMARY' ? 'Summary of a chat' : 'Written by hand'}</p>}/>
        </PanelSection>
        <PanelSection label="Dates">
            <PanelFact label="Written" value={formatFullDate(note.createdAt) || '—'}/>
            <PanelFact label="Updated" value={formatFullDate(note.updatedAt ?? note.createdAt) || '—'}/>
        </PanelSection>
    </>
}
