import {EmptyState} from '@uliss/design-system'
import {Screen} from '../ui/Screen'

/**
 * Updates — the log of everything Uliss did on its own (links drawn, notes written, patterns
 * noticed) plus the decisions it asks about. Nothing emits these yet, so this is the empty
 * state — "zero is a normal day" (see `uliss-nav.jsx`). Wave 10 adds the log + filters + Undo.
 */
export function UpdatesPage() {
    return (
        <Screen kicker="Updates" count={0}>
            <div className="screen-empty">
                <EmptyState
                    title="Nothing to report yet"
                    body="This is where Uliss records what it does on its own — links it draws, notes it writes, patterns it spots. It fills in as you talk."
                />
            </div>
        </Screen>
    )
}
