import {StepControl} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const SIZES = [
    {id: 'compact', label: 'Compact'}, {id: 'regular', label: 'Regular'},
    {id: 'large', label: 'Large'}, {id: 'larger', label: 'Larger'},
]
const SIZE_PX: Record<string, number> = {compact: 13, regular: 14.5, large: 16, larger: 18}

export const TextSize = () => {
    const [size, setSize] = useState('regular')
    return (
        <Ground width={360}>
            <StepControl label="Text size" big steps={SIZES} value={size} onPick={setSize}
                         renderStep={(s, on) => (
                             <span style={{
                                 fontFamily: 'var(--font-text)', fontSize: SIZE_PX[s.id], lineHeight: 1,
                                 color: on ? 'var(--read-fg)' : 'var(--text-muted)',
                             }}>Aa</span>
                         )}/>
        </Ground>
    )
}

export const ThreeWords = () => {
    const [v, setV] = useState('focus')
    return (
        <Ground width={360}>
            <StepControl label="Sky density" value={v} onPick={setV}
                         steps={[{id: 'quiet', label: 'Quiet'}, {id: 'focus', label: 'Focus'}, {
                             id: 'full',
                             label: 'Full'
                         }]}/>
        </Ground>
    )
}

export const Disabled = () => (
    <Ground width={360}>
        <StepControl label="Star size" value="regular" disabled
                     steps={[{id: 'fine', label: 'Fine'}, {id: 'regular', label: 'Regular'},
                         {id: 'bold', label: 'Bold'}, {id: 'beacon', label: 'Beacon'}]}/>
    </Ground>
)
