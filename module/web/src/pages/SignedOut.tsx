import {login} from '../auth/authApi'
import {Shell} from '../ui/Shell'
import {useMessages} from '@uliss/design-system'
import {authPagesMessages} from './authPages.messages'

/**
 * Where the auth server's end-session endpoint returns the browser. Deliberately outside RequireAuth: signing in again
 * is the user's choice, so a shared computer does not land back in the account.
 */
export function SignedOut() {
    const t = useMessages(authPagesMessages)
    return (
        <Shell kicker={t.signedOut}>
            <p className="auth-muted">{t.signedOutBody}</p>
            <div className="panel-actions">
                <button type="button" className="link-btn" onClick={() => login()}>
                    {t.signIn}
                </button>
            </div>
        </Shell>
    )
}
