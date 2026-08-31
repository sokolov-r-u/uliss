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
    return (
        <SettingsShell kicker="Sky">
            <p className="settings-para">
                These shape the constellation map — how names show, how large the stars read, how
                the branches hold together. They take effect once your sky has stars to arrange.
            </p>

            <div className="settings-inert">
                <SectionLabel>Labels</SectionLabel>
                <OptionList marker="dot" selected={1} options={['Always', 'Auto', 'Off']}/>

                <SectionLabel>Star size</SectionLabel>
                <StepControl value="regular" steps={STAR_SIZE}/>

                <SectionLabel>Colour</SectionLabel>
                <OptionList marker="dot" selected={0} options={['By constellation', 'Monochrome']}/>
            </div>

            <p className="settings-foot-note">Not active yet — your sky has no stars to arrange</p>
        </SettingsShell>
    )
}
