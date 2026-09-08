import {Button} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {useAuth} from '../auth/AuthContext'

/**
 * Account — static per the mock-up. The SPA holds only opaque tokens (`sub` is a UUID, not
 * PII), and `user-service` exposes no profile read yet, so there is nothing to show or edit.
 * The one real control is Sign out.
 */
export function AccountSettings() {
    const {logout} = useAuth()

    return (
        <SettingsShell kicker="Account">
            <SectionLabel>Profile</SectionLabel>
            <p className="settings-para">
                Profile details are not available to this client. Account editing is unavailable.
            </p>

            <SectionLabel>Session</SectionLabel>
            <Button variant="quiet" size="lg" onClick={() => void logout()}>Sign out</Button>
        </SettingsShell>
    )
}
