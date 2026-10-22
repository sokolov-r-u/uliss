import {Icon, IconButton, TextField} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const Empty = () => {
    const [name, setName] = useState('')
    return (
        <Ground width={320}>
            <TextField label="Name" placeholder="How should Uliss call you?" value={name}
                       onChange={(e) => setName(e.target.value)} maxLength={24}/>
        </Ground>
    )
}

export const FocusedWithCounter = () => {
    const [name, setName] = useState('Penelope')
    return (
        <Ground width={320}>
            <TextField label="Name" value={name} focused
                       onChange={(e) => setName(e.target.value)} maxLength={24}/>
        </Ground>
    )
}

export const NearLimit = () => {
    const [title, setTitle] = useState('Letters to the summer h')
    return (
        <Ground width={320}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={24}/>
        </Ground>
    )
}

export const SoftLimitWithMic = () => {
    const [title, setTitle] = useState('Giant Steps')
    return (
        <Ground width={320}>
            <TextField label="Name" value={title} limit={50} onChange={(e) => setTitle(e.target.value)}
                       trailing={<IconButton title="Dictate the name"><Icon name="mic" size={16}/></IconButton>}/>
        </Ground>
    )
}

export const OverSoftLimit = () => {
    const [title, setTitle] = useState('Notes on Coltrane, Giant Steps and the sheets of sound')
    return (
        <Ground width={320}>
            <TextField label="Name" value={title} limit={50} onChange={(e) => setTitle(e.target.value)}
                       trailing={<IconButton title="Dictate the name"><Icon name="mic" size={16}/></IconButton>}/>
        </Ground>
    )
}

export const Disabled = () => (
    <Ground width={320}>
        <TextField label="Name" value="Penelope" onChange={() => undefined} disabled/>
    </Ground>
)
