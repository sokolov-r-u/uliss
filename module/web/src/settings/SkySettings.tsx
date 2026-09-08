import {useState} from 'react'
import {OptionList, StepControl} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'

/**
 * Sky settings — static per the mock-up. These tune a constellation renderer that doesn't
 * exist yet (no graph data, no force layout), so the controls are shown without handlers:
 * a taste of what's coming, inert until the sky has stars. Wave 9+ wires them.
 */
const STAR_SIZE = [
    {id: 'fine', label: 'Fine'},
    {id: 'regular', label: 'Regular'},
    {id: 'bold', label: 'Bold'},
    {id: 'beacon', label: 'Beacon'},
]

export function SkySettings() {
    const [labels] = useState(1)
    const [starSize] = useState('regular')
    const [colour] = useState(0)
    return (
        <SettingsShell kicker="Sky">
            <p className="settings-para">
                These shape the constellation map — how names show, how large the stars read, how
                the branches hold together. They take effect once your sky has stars to arrange.
            </p>

            <div className="sky-settings-preview" aria-label="Sky preview">
                <span/><span/><span/><i/><i/>
            </div>

            <div>
                <SectionLabel>Labels</SectionLabel>
                <OptionList label="Labels" disabled marker="dot" selected={labels} options={['Always', 'Auto', 'Off']}/>

                <SectionLabel>Star size</SectionLabel>
                <StepControl label="Star size" disabled value={starSize} steps={STAR_SIZE}/>

                <SectionLabel>Colour</SectionLabel>
                <OptionList label="Colour" disabled marker="dot" selected={colour}
                            options={['By constellation', 'Monochrome']}/>
            </div>

            <p className="settings-foot-note">Controls are unavailable until graph data exists</p>
        </SettingsShell>
    )
}
