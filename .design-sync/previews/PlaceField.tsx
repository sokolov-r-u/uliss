import {ConstellationPicker, type ConstellationPickerItem, constellationColor, PlaceField} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Music', depth: 0, path: [], color: constellationColor(264), count: 12},
    {id: 'jazz', parentId: 'music', name: 'Jazz', depth: 1, path: ['Music'], color: constellationColor(264, 'LIGHT'), count: 6},
    {id: 'films', parentId: null, name: 'Films', depth: 0, path: [], color: constellationColor(22), count: 4},
]

function Live({initial}: { initial: string | null }) {
    const [place, setPlace] = useState(initial)
    return <PlaceField label="Place" value={place} onClear={() => setPlace(null)}>
        {(close) => <ConstellationPicker items={ITEMS} action={(name) => `Choose ${name}`} onClose={close}
                                         onPick={(id) => {
                                             const item = ITEMS.find((candidate) => candidate.id === id)
                                             setPlace(item ? [...item.path, item.name].join(' › ') : null)
                                             close()
                                         }}/>}
    </PlaceField>
}

export const Empty = () => (
    <Ground width={340} style={{minHeight: 420}}>
        <Live initial={null}/>
    </Ground>
)

export const Chosen = () => (
    <Ground width={340}>
        <Live initial="Music › Jazz"/>
    </Ground>
)
