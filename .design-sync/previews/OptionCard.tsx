import {OptionCard} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const GROUNDS = [
    {
        id: 'obsidian',
        label: 'Obsidian',
        note: 'Neutral black grounds',
        bands: ['#0a0a0a', '#161616', '#eae6df', '#d99a4e']
    },
    {id: 'void', label: 'Void', note: 'Deeper, cooler black', bands: ['#050608', '#101216', '#e4e2de', '#d99a4e']},
]

const Bands = ({colors}: { colors: string[] }) => (
    <>{colors.map((c, i) => <span key={i} style={{flex: 1, background: c}}/>)}</>
)

export const GroundPicker = () => {
    const [ground, setGround] = useState('obsidian')
    return (
        <Ground width={340}>
            <div role="radiogroup" aria-label="Ground" style={{display: 'grid', gap: 8}}>
                {GROUNDS.map((g) => (
                    <OptionCard key={g.id} label={g.label} note={g.note} on={g.id === ground}
                                onPick={() => setGround(g.id)} preview={<Bands colors={g.bands}/>}/>
                ))}
            </div>
        </Ground>
    )
}

export const DotMarker = () => (
    <Ground width={340}>
        <div role="radiogroup" aria-label="Pace" style={{display: 'grid', gap: 8}}>
            <OptionCard marker="dot" label="Once a week" on/>
            <OptionCard marker="dot" label="Only when I ask"/>
        </div>
    </Ground>
)

export const WithGreekAndDisabled = () => (
    <Ground width={340}>
        <div role="radiogroup" aria-label="Language" style={{display: 'grid', gap: 8}}>
            <OptionCard marker="dot" label="English" greek="γλῶσσα" on/>
            <OptionCard marker="dot" label="Ελληνικά" note="Coming later" disabled/>
        </div>
    </Ground>
)
