import {listNotesWithoutConstellation} from '../notes/noteApi'
import {plural} from './constellationTree'
import {NotesHere} from './NotesHere'

const UNPLACED = 'without-constellation'

const loadUnplaced = (_: string, signal: AbortSignal) => listNotesWithoutConstellation(signal)

/** Notes with no place yet: no Rename, colour, Move or Delete; a note is placed from its own panel. */
export function UnplacedPanel({count, onOpenNote}: { count: number; onOpenNote: (noteId: string) => void }) {
    return (
        <div className="constellation-panel unplaced">
            <div className="constellation-panel-head">
                <h2 className="constellation-panel-name"><span>Without constellation</span></h2>
                <p className="constellation-panel-meta">{plural(count, 'star', 'stars')}</p>
                <p className="constellation-panel-hint">Notes with no place yet. Open one and add it to a constellation
                    from its panel.</p>
            </div>
            <NotesHere id={UNPLACED} load={loadUnplaced} onOpen={onOpenNote} empty="Every note has a place."/>
        </div>
    )
}
