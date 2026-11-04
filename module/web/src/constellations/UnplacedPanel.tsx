import {listNotesWithoutConstellation} from '../notes/noteApi'
import {NotesHere} from './NotesHere'
import {useMessages} from '@uliss/design-system'
import {constellationsMessages} from './constellations.messages'

const UNPLACED = 'without-constellation'

const loadUnplaced = (_: string, signal: AbortSignal) => listNotesWithoutConstellation(signal)

/** Notes with no place yet: no Rename, colour, Move or Delete; a note is placed from its own panel. */
export function UnplacedPanel({count, onOpenNote}: { count: number; onOpenNote: (noteId: string) => void }) {
    const t = useMessages(constellationsMessages)
    return (
        <div className="constellation-panel unplaced">
            <div className="constellation-panel-head">
                <h2 className="constellation-panel-name"><span>{t.unplaced}</span></h2>
                <p className="constellation-panel-meta">{t.stars(count)}</p>
                <p className="constellation-panel-hint">{t.unplacedHint}</p>
            </div>
            <NotesHere id={UNPLACED} load={loadUnplaced} onOpen={onOpenNote} empty={t.everyNotePlaced}/>
        </div>
    )
}
