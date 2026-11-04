import {Button, ConstellationPicker, useMessages} from '@uliss/design-system'
import type {SummaryPlace, SummaryPlaces} from './useSummaryPlaces'
import './summary-place.css'
import {commonMessages} from '../i18n/common.messages'
import {constellationsMessages} from './constellations.messages'

/**
 * The "Choose a place" step of the Summarize dialog: the shared tree picker with every constellation and note, filling
 * the step. It can create a constellation where the user stands; a picked note becomes the new note's parent.
 */
export function SummaryPlacePicker({places, busy, error, onPick}: {
    places: SummaryPlaces
    busy: boolean
    /** A failed creation, shown here: the dialog's own message block is hidden under this step. */
    error: string | null
    onPick: (place: SummaryPlace) => void
}) {
    return <div className="summary-place-step">
        <div className="summary-place-tree"><Tree places={places} busy={busy} onPick={onPick}/></div>
        {error && <p className="summary-place-error" role="alert">{error}</p>}
    </div>
}

function Tree({places, busy, onPick}: { places: SummaryPlaces; busy: boolean; onPick: (place: SummaryPlace) => void }) {
    const t = useMessages(constellationsMessages)
    const common = useMessages(commonMessages)
    if (places.load.status === 'ready') {
        return <ConstellationPicker fill items={places.items} label={t.findPlace} action={t.putIn}
                                    busy={busy} onCreate={places.createIn}
                                    onPick={(id) => onPick({constellationId: id})}
                                    notes={{
                                        items: places.notes,
                                        action: t.putUnder,
                                        onPick: (id) => onPick({parentNoteId: id}),
                                    }}/>
    }
    return <div className="summary-place-state">
        {places.load.status === 'loading'
            ? <p className="context-text">{t.loadingConstellations}</p>
            : <>
                <p className="context-text">{t.couldNotLoadConstellations}</p>
                <Button size="sm" variant="quiet" onClick={places.reload}>{common.retry}</Button>
            </>}
    </div>
}
