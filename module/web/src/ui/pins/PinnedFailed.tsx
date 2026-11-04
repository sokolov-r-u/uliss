import {Button, useMessages} from '@uliss/design-system'
import '../list/list-more.css'
import {commonMessages} from '../../i18n/common.messages'
import {uiMessages} from '../ui.messages'

/**
 * Said in place of the Pinned group when it did not load: the pages leave pinned items out, so they would vanish.
 * The side nav shows it beside a list screen that may say the same, so only one of them [announce]s it.
 */
export function PinnedFailed({onRetry, announce = true}: { onRetry: () => void; announce?: boolean }) {
    const t = useMessages(uiMessages)
    const common = useMessages(commonMessages)
    return <div className="list-more">
        <span role={announce ? 'alert' : undefined}>{t.pinnedFailed}</span>
        <Button size="sm" variant="quiet" onClick={onRetry}>{common.retry}</Button>
    </div>
}
