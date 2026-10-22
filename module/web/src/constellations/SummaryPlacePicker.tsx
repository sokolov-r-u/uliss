import {Button, ConstellationPicker} from '@uliss/design-system'
import type {SummaryPlace, SummaryPlaces} from './useSummaryPlaces'
import './summary-place.css'

/**
 * The "Choose a place" step of the Summarize dialog: the shared tree picker with every constellation and note, filling
 * the step. It can create a constellation where the user stands; a picked note becomes the new note's parent.
 */
export function SummaryPlacePicker({places, busy, onPick}: {
    places: SummaryPlaces
    busy: boolean
    onPick: (place: SummaryPlace) => void
}) {
    if (places.load.status === 'ready') {
        return <ConstellationPicker fill items={places.items} label="Find a place…" action={(name) => `Put in ${name}`}
                                    busy={busy} onCreate={places.createIn}
                                    onPick={(id) => onPick({constellationId: id})}
                                    notes={{
                                        items: places.notes,
                                        action: (title) => `Put under ${title}`,
                                        onPick: (id) => onPick({parentNoteId: id}),
                                    }}/>
    }
    return <div className="summary-place-state">
        {places.load.status === 'loading'
            ? <p className="context-text">Loading the constellations…</p>
            : <>
                <p className="context-text">Could not load the constellations.</p>
                <Button size="sm" variant="quiet" onClick={places.reload}>Retry</Button>
            </>}
    </div>
}
