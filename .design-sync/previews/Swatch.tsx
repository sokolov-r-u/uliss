import {LabelRow, Swatch} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const ACCENTS = [
    {id: 'ochre', label: 'Ochre', accent: '#d99a4e'},
    {id: 'terracotta', label: 'Terracotta', accent: '#c8643c'},
    {id: 'patina', label: 'Patina', accent: '#5c8a72'},
    {id: 'bone', label: 'Bone', accent: '#b9a888'},
]

export const AccentPicker = () => {
    const [accent, setAccent] = useState('ochre')
    return (
        <Ground width={340}>
            <LabelRow rule>Accent</LabelRow>
            <div role="radiogroup" aria-label="Accent"
                 style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginTop: 12}}>
                {ACCENTS.map((a) => (
                    <Swatch key={a.id} label={a.label} color={a.accent} on={a.id === accent}
                            onPick={() => setAccent(a.id)}/>
                ))}
            </div>
        </Ground>
    )
}

export const Disabled = () => (
    <Ground width={340}>
        <div role="radiogroup" aria-label="Accent"
             style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7}}>
            {ACCENTS.map((a) => <Swatch key={a.id} label={a.label} color={a.accent} on={a.id === 'patina'} disabled/>)}
        </div>
    </Ground>
)
