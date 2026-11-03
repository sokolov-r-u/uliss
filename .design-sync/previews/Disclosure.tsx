import {Disclosure} from '@uliss/design-system'
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
