import {Button} from '@uliss/design-system'
import '../list/list-more.css'

/** Said in place of the Pinned group when it did not load: the pages leave pinned items out, so they would vanish. */
export function PinnedFailed({onRetry}: { onRetry: () => void }) {
    return <div className="list-more">
        <span role="alert">Pinned items did not load.</span>
        <Button size="sm" variant="quiet" onClick={onRetry}>Retry</Button>
    </div>
}
