import {OptionList} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'

/**
 * Language — static per the mock-up. Uliss has no i18n layer, so English is the only choice;
 * the rest are shown as what's coming, not as pickable options.
 */
export function LanguageSettings() {
    return (
        <SettingsShell kicker="Language">
            <SectionLabel>Interface &amp; replies</SectionLabel>
            <OptionList label="Interface and reply language" disabled marker="dot" selected={0} options={['English']}/>
            <p className="settings-para">
                The interface and generated replies currently use English. No language-changing contract is available.
            </p>
        </SettingsShell>
    )
}
