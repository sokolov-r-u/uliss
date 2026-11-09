import {Disclosure, Icon, IconButton} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const ClosedAndOpen = () => {
    const [about, setAbout] = useState(false)
    const [rules, setRules] = useState(true)
    return (
        <Ground width={360}>
            <Disclosure first title="About me" hint="Designer in Lisbon" open={about} onToggle={setAbout}>
                <p style={{margin: 0, color: 'var(--cream-dim)'}}>Designer in Lisbon. Plays the saxophone.</p>
            </Disclosure>
            <Disclosure title="Profile rules" hint="2 rules" open={rules} onToggle={setRules}>
                <ol style={{margin: 0, paddingLeft: 18, color: 'var(--cream-dim)'}}>
                    <li>No films.</li>
                    <li>Short sections.</li>
                </ol>
            </Disclosure>
        </Ground>
    )
}

export const PanelSection = () => {
    const [poster, setPoster] = useState(true)
    const [place, setPlace] = useState(false)
    return (
        <Ground width={300}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px',
                borderBottom: '1px solid var(--line)'}}>
                <Disclosure variant="section" title="Poster" open={poster} onToggle={setPoster}
                            actions={<>
                                <IconButton title="Change poster"><Icon name="edit" size={14}/></IconButton>
                                <IconButton title="Remove poster"><Icon name="trash" size={14}/></IconButton>
                            </>}>
                    <p style={{margin: 0, color: 'var(--cream-dim)', fontSize: 12}}>The note's poster.</p>
                </Disclosure>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px'}}>
                <Disclosure variant="section" title="Constellation" hint="2" open={place} onToggle={setPlace}>
                    <p style={{margin: 0, color: 'var(--cream-dim)', fontSize: 12}}>Travel › Coast</p>
                </Disclosure>
            </div>
        </Ground>
    )
}
