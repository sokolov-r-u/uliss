import {ConstellationPicker, type ConstellationPickerItem, constellationColor} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Music', depth: 0, path: [], color: constellationColor(264), count: 12},
    {id: 'jazz', parentId: 'music', name: 'Jazz', depth: 1, path: ['Music'], color: constellationColor(264, 'LIGHT'), count: 6},
    {id: 'miles', parentId: 'jazz', name: 'Miles', depth: 2, path: ['Music', 'Jazz'], color: constellationColor(264, 'PALE'), count: 2},
    {id: 'films', parentId: null, name: 'Films', depth: 0, path: [], color: constellationColor(22), count: 4},
    {id: 'noir', parentId: 'films', name: 'Noir', depth: 1, path: ['Films'], color: constellationColor(22, 'LIGHT'), count: 1},
]

export const MoveBranch = () => (
    <Ground width={320}>
        <ConstellationPicker items={ITEMS} exclude={['jazz', 'miles']} action={(name) => `Move to ${name}`}
                             lead={{label: 'Make it a root', onSelect: () => undefined}}
                             onPick={() => undefined} onClose={() => undefined}/>
    </Ground>
)

export const PlaceWithCreate = () => (
    <Ground width={320}>
        <ConstellationPicker items={ITEMS} action={(name) => `Add to ${name}`} onPick={() => undefined}
                             onCreate={async () => undefined} onClose={() => undefined}/>
    </Ground>
)

const NOTES = [
    {id: 'bowie', title: 'Bowie', path: ['Music', 'Rock'], color: constellationColor(264, 'LIGHT')},
    {id: 'low', title: 'Low', path: ['Music', 'Rock', 'Bowie'], color: constellationColor(264, 'LIGHT')},
    {id: 'loose', title: 'A loose thought', path: []},
]

const searchNotes = async (query: string) =>
    NOTES.filter((note) => note.title.toLowerCase().includes(query.toLowerCase()))

export const SummarizeIntoPlaceOrNote = () => (
    <Ground width={320}>
        <ConstellationPicker items={ITEMS} action={(name) => `Summarize into ${name}`} onPick={() => undefined}
                             notes={{search: searchNotes, action: (title) => `Summarize under ${title}`,
                                 onPick: () => undefined}}
                             onCreate={async () => undefined} onClose={() => undefined}/>
    </Ground>
)

export const MoveUnderANote = () => (
    <Ground width={320}>
        <ConstellationPicker items={[]} label="Find a note…" action={(name) => name} onPick={() => undefined}
                             notes={{search: searchNotes, action: (title) => `Move under ${title}`,
                                 onPick: () => undefined}}
                             onClose={() => undefined}/>
    </Ground>
)
