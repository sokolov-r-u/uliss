import {Button} from '@uliss/design-system'
import '../list/list-more.css'

/**
 * Said in place of the Pinned group when it did not load: the pages leave pinned items out, so they would vanish.
 * The side nav shows it beside a list screen that may say the same, so only one of them [announce]s it.
 */
export function PinnedFailed({onRetry, announce = true}: { onRetry: () => void; announce?: boolean }) {
    return <div className="list-more">
        <span role={announce ? 'alert' : undefined}>Pinned items did not load.</span>
        <Button size="sm" variant="quiet" onClick={onRetry}>Retry</Button>
    </div>
}
