import {TextArea} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const Empty = () => {
    const [about, setAbout] = useState('')
    return (
        <Ground width={360}>
            <TextArea label="About me" placeholder="Work, where you live, what matters to you" value={about}
                      limit={2000} onChange={(e) => setAbout(e.target.value)}/>
        </Ground>
    )
}

export const WithText = () => {
    const [about, setAbout] = useState('Designer in Lisbon. Plays the saxophone on weekends.\nReads mostly essays.')
    return (
        <Ground width={360}>
            <TextArea label="About me" value={about} limit={2000} onChange={(e) => setAbout(e.target.value)}/>
        </Ground>
    )
}

export const OverLimit = () => {
    const [rule, setRule] = useState('Never mention films, series or anything I watched, even when a note is about one.')
    return (
        <Ground width={360}>
            <TextArea aria-label="Rule 1" value={rule} limit={60} rows={2} onChange={(e) => setRule(e.target.value)}/>
        </Ground>
    )
}
