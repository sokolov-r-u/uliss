import {Button, useMessages} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {useAuth} from '../auth/AuthContext'
import {accountMessages} from './account.messages'

/**
 * Account — static per the mock-up. The SPA holds only opaque tokens (`sub` is a UUID, not
 * PII), and `user-service` exposes no profile read yet, so there is nothing to show or edit.
 * The one real control is Sign out.
 */
export function AccountSettings() {
    const {logout} = useAuth()
    const t = useMessages(accountMessages)

    return (
        <SettingsShell kicker={t.kicker}>
            <SectionLabel>{t.profile}</SectionLabel>
            <p className="settings-para">{t.profileBody}</p>

            <SectionLabel>{t.session}</SectionLabel>
            <Button variant="quiet" size="lg" onClick={() => void logout()}>{t.signOut}</Button>
        </SettingsShell>
    )
}
