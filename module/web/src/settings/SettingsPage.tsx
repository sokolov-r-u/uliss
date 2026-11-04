import {useEffect, useState} from 'react'
import {Outlet, useLocation, useNavigate} from 'react-router-dom'
import {SettingsRow, useMessages} from '@uliss/design-system'
import {ScreenHeader} from '../ui/ScreenHeader'
import {readTheme, THEME_EVENT} from '../ui/theme'
import {useLocaleChoice} from '../i18n/AppLocale'
import {LANGUAGE_NAMES} from '../i18n/languageNames'
import {languageSettingsMessages} from './LanguageSettings.messages'
import {settingsPageMessages} from './SettingsPage.messages'
import {appearanceMessages} from './appearance.messages'

/**
 * Settings — five rows, five screens; each hint states the current value (see `SettingsRow.prompt.md`). One layout
 * for every breakpoint: on the phone the root shows the rows and a section replaces them; from 1024px the rows stay
 * on the left and the section opens on the right (kit two-pane). The bare route opens Appearance. Appearance, Sky
 * and About you are wired to real behaviour; the rest are static (no backend).
 */
export function SettingsPage() {
    const t = useMessages(settingsPageMessages)
    const language = useMessages(languageSettingsMessages)
    const appearance = useMessages(appearanceMessages)
    const {choice, locale} = useLocaleChoice()
    const navigate = useNavigate()
    const {pathname} = useLocation()
    const [theme, setTheme] = useState(readTheme)
    const section = pathname.split('/').filter(Boolean)[1] ?? null

    useEffect(() => {
        const onTheme = () => setTheme(readTheme())
        window.addEventListener(THEME_EVENT, onTheme)
        return () => window.removeEventListener(THEME_EVENT, onTheme)
    }, [])

    const rows = [
        {id: 'appearance', label: t.appearance, hint: appearance.hint(appearance[`${theme.ground}Short`], appearance[theme.accent], appearance[theme.read])},
        {id: 'sky', label: t.sky, hint: t.skyHint},
        {id: 'about-you', label: t.aboutYou, hint: t.aboutYouHint},
        {id: 'account', label: t.account, hint: t.accountHint},
        {id: 'language', label: t.language, hint: language.rowHint(LANGUAGE_NAMES[locale], choice === 'auto')},
    ]
    const current = section ?? 'appearance'

    return (
        <div className={section ? 'screen settings-layout is-section' : 'screen settings-layout'}>
            <ScreenHeader kicker={t.kicker}/>
            <div className="settings-panes">
                <nav className="settings-rows" aria-label={t.sections}>
                    {rows.map((r, i) => (
                        <SettingsRow
                            key={r.id}
                            label={r.label}
                            hint={r.hint}
                            first={i === 0}
                            active={r.id === current}
                            aria-current={r.id === current ? 'page' : undefined}
                            onClick={() => navigate(`/settings/${r.id}`)}
                        />
                    ))}
                    <p className="settings-version">{t.version}</p>
                </nav>
                <div className="settings-detail"><Outlet/></div>
            </div>
        </div>
    )
}
