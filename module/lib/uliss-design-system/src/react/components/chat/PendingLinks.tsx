import {PendingStatus} from '../feedback/PendingStatus'
import {useMessages} from '../../i18n/LocaleContext'
import {pendingLinksMessages} from './PendingLinks.messages'

// The "still thinking" line for links. Uliss computes a note's links after it
// saves, so any list of links has a window where it is legitimately empty — and
// an empty list must not read as "no links found". `PendingStatus` with a
// links label stands in instead.

export interface PendingLinksProps {
    /** Lowercase, with an ellipsis. 'looking for links…' */
    label?: string
    size?: number
    pad?: string
    minHeight?: number
}

export function PendingLinks({
                                 label: labelProp,
                                 size = 10.5,
                                 pad = '11px 0',
                                 minHeight = 44,
                             }: PendingLinksProps) {
    const t = useMessages(pendingLinksMessages)
    const label = labelProp ?? t.lookingForLinks
    return <PendingStatus label={label} size={size} pad={pad} minHeight={minHeight}/>
}
