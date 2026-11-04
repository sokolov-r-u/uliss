import {OptionList, useMessages} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {useLocaleChoice} from '../i18n/AppLocale'
import {browserLocale, type LocaleChoice} from '../i18n/localeChoice'
import {LANGUAGE_NAMES} from '../i18n/languageNames'
import {languageSettingsMessages} from './LanguageSettings.messages'

const CHOICES: LocaleChoice[] = ['auto', 'en', 'ru']

/**
 * Language — the interface language for this browser: as in the browser (the default), or a fixed one. The choice
 * switches the app at once and is shared with the sign-in page through the `uliss_lang` cookie. It does not steer
 * the AI: replies and notes follow the language of the chat.
 */
export function LanguageSettings() {
    const t = useMessages(languageSettingsMessages)
    const {choice, setChoice} = useLocaleChoice()
    const options = CHOICES.map((item) => item === 'auto'
        ? {label: t.auto, note: t.autoNote(LANGUAGE_NAMES[browserLocale()])}
        : {label: LANGUAGE_NAMES[item], note: t.explicitNote})

    return (
        <SettingsShell kicker={t.kicker}>
            <SectionLabel>{t.section}</SectionLabel>
            <OptionList label={t.group} marker="dot" selected={CHOICES.indexOf(choice)} options={options}
                        onPick={(index) => setChoice(CHOICES[index])}/>
            <p className="settings-para">{t.para}</p>
        </SettingsShell>
    )
}
