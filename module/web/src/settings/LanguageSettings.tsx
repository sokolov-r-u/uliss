import {Icon} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'

/**
 * Language — static per the mock-up. Uliss has no i18n layer, so English is the only choice;
 * the rest are shown as what's coming, not as pickable options.
 */
const LANGUAGES = ['English', 'Русский', 'Deutsch', 'Español', 'Français', 'Italiano']

export function LanguageSettings() {
    return (
        <SettingsShell kicker="Language">
            <SectionLabel>Interface &amp; replies</SectionLabel>
            <div className="settings-lang-list">
                {LANGUAGES.map((lang) => {
                    const on = lang === 'English'
                    return (
                        <div key={lang} className={on ? 'settings-lang-row on' : 'settings-lang-row'}>
                            <span className="settings-lang-name">{lang}</span>
                            {on
                                ? <span className="settings-lang-tick"><Icon name="tick" size={13}/></span>
                                : <span className="settings-lang-box"/>}
                        </div>
                    )
                })}
            </div>
            <p className="settings-para">
                You can speak any language — Uliss understands the note as it was said. It currently
                answers and writes notes in English.
            </p>
        </SettingsShell>
    )
}
