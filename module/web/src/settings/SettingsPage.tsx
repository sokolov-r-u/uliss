import {useEffect, useState} from 'react'
import {Outlet, useLocation, useNavigate} from 'react-router-dom'
import {SettingsRow} from '@uliss/design-system'
import {ScreenHeader} from '../ui/ScreenHeader'
import {readTheme, THEME_EVENT} from '../ui/theme'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/**
 * Settings — four rows, four screens; each hint states the current value (see `SettingsRow.prompt.md`). One layout
 * for every breakpoint: on the phone the root shows the rows and a section replaces them; from 1024px the rows stay
 * on the left and the section opens on the right (kit two-pane). The bare route opens Appearance. Only Appearance
 * is wired to real behaviour; the rest are static (no backend).
 */
export function SettingsPage() {
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
        {id: 'appearance', label: 'Appearance', hint: `${cap(theme.ground)} · ${cap(theme.accent)} · ${cap(theme.read)} text`},
        {id: 'sky', label: 'Sky', hint: 'Unavailable · no graph data'},
        {id: 'account', label: 'Account', hint: 'Sign out available'},
        {id: 'language', label: 'Language', hint: 'English · fixed'},
    ]
    const current = section ?? 'appearance'

    return (
        <div className={section ? 'screen settings-layout is-section' : 'screen settings-layout'}>
            <ScreenHeader kicker="Settings"/>
            <div className="settings-panes">
                <nav className="settings-rows" aria-label="Settings sections">
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
                    <p className="settings-version">Uliss · web preview</p>
                </nav>
                <div className="settings-detail"><Outlet/></div>
            </div>
        </div>
    )
}
