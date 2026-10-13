import {Select} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

const SEX = [
    {value: 'woman', label: 'Woman'},
    {value: 'man', label: 'Man'},
    {value: 'unsaid', label: 'Prefer not to say'},
]

export const Closed = () => {
    const [value, setValue] = useState<string | null>('woman')
    return (
        <Ground width={340}>
            <Select label="Gender" value={value} onChange={setValue} options={SEX}/>
        </Ground>
    )
}

export const Open = () => {
    const [value, setValue] = useState<string | null>('woman')
    return (
        <Ground width={340} style={{minHeight: 260}}>
            <Select label="Gender" value={value} onChange={setValue} options={SEX} open
                    onOpenChange={() => undefined}/>
        </Ground>
    )
}

export const Placeholder = () => {
    const [value, setValue] = useState<string | null>(null)
    return (
        <Ground width={340}>
            <Select label="Constellation" placeholder="All constellations" value={value}
                    onChange={setValue}
                    options={[{value: 'travel', label: 'Travel'}, {value: 'reading', label: 'Reading'}]}/>
        </Ground>
    )
}

export const Disabled = () => (
    <Ground width={340}>
        <Select aria-label="Filter by constellation" value="travel" onChange={() => undefined} disabled
                options={[{value: 'travel', label: 'Travel'}, {value: 'reading', label: 'Reading'}]}/>
    </Ground>
)
