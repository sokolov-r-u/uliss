import {login} from '../auth/authApi'
import {Shell} from '../ui/Shell'

/**
 * Where the auth server's end-session endpoint returns the browser. Deliberately outside RequireAuth: signing in again
 * is the user's choice, so a shared computer does not land back in the account.
 */
export function SignedOut() {
    return (
        <Shell kicker="signed out">
            <p className="auth-muted">You are signed out of Uliss on this device.</p>
            <div className="panel-actions">
                <button type="button" className="link-btn" onClick={() => login()}>
                    sign in
                </button>
            </div>
        </Shell>
    )
}
