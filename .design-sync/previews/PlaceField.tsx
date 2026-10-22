import {ConstellationPicker, type ConstellationPickerItem, constellationColor, Notice, PlaceField} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Music', depth: 0, path: [], color: constellationColor(264), count: 12},
    {id: 'jazz', parentId: 'music', name: 'Jazz', depth: 1, path: ['Music'], color: constellationColor(264, 'LIGHT'), count: 6},
    {id: 'films', parentId: null, name: 'Films', depth: 0, path: [], color: constellationColor(22), count: 4},
]

function Live({initial, startPicking = false}: { initial: string | null; startPicking?: boolean }) {
    const [place, setPlace] = useState(initial)
    const [picking, setPicking] = useState(startPicking)
    return <Notice width={360} title="Create a summary note?" primary="Summarize" onPrimary={() => undefined}
                   showClose onClose={() => undefined}
                   body="Name the note if you like and choose where it will live."
                   step={picking ? {
                       title: 'Choose a place', onBack: () => setPicking(false), children:
                           <ConstellationPicker fill items={ITEMS} action={(name) => `Put in ${name}`}
                                                onPick={(id) => {
                                                    const item = ITEMS.find((candidate) => candidate.id === id)
                                                    setPlace(item ? [...item.path, item.name].join(' › ') : null)
                                                    setPicking(false)
                                                }}/>,
                   } : undefined}>
        <PlaceField label="Place" value={place} open={picking} onOpen={() => setPicking(true)}
                    onClear={() => setPlace(null)}/>
    </Notice>
}

export const Chosen = () => (
    <Ground pad={28}>
        <Live initial="Music › Jazz"/>
    </Ground>
)

export const PickingStep = () => (
    <Ground pad={28}>
        <Live initial={null} startPicking/>
    </Ground>
)
