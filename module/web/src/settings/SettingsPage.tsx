import {useNavigate} from 'react-router-dom'
import {SettingsRow} from '@uliss/design-system'
import {Screen} from '../ui/Screen'
import {readTheme} from '../ui/theme'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/**
 * Settings root — four rows, four screens. Each hint states the current value (see
 * `SettingsRow.prompt.md`). Only Appearance is wired to real behaviour; the rest are static
 * per the mock-up (no backend). Reached from the SideNav gear (`/settings`).
 */
export function SettingsPage() {
    const navigate = useNavigate()
    const t = readTheme()

    const rows = [
        {
            to: '/settings/appearance',
            label: 'Appearance',
            hint: `${cap(t.ground)} · ${cap(t.accent)} · ${cap(t.read)} text`
        },
        {to: '/settings/sky', label: 'Sky', hint: 'Map styling'},
        {to: '/settings/account', label: 'Account', hint: 'Sign out'},
        {to: '/settings/language', label: 'Language', hint: 'English'},
    ]

    return (
        <Screen kicker="Settings">
            <div className="settings-list">
                {rows.map((r, i) => (
                    <SettingsRow
                        key={r.to}
                        label={r.label}
                        hint={r.hint}
                        first={i === 0}
                        onClick={() => navigate(r.to)}
                    />
                ))}
                <p className="settings-version">Uliss · web preview</p>
            </div>
        </Screen>
    )
}
