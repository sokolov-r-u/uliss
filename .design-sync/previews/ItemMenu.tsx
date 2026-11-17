import {Icon, ItemMenu, ListRow} from '@uliss/design-system'
import {useEffect, useRef, useState} from 'react'
import {Ground} from '../preview-kit/Ground'

// ItemMenu portals a fixed menu next to its anchor; the anchor here is the row's dots button.
// The menu places itself once, from the window size: a host that mounts the card before sizing its frame (the artifact
// page) would leave it off-screen, so it mounts only in a sized window and remounts when the window resizes.
function Anchored({deleteDisabled = false}: { deleteDisabled?: boolean }) {
    const rowRef = useRef<HTMLDivElement>(null)
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    const [size, setSize] = useState(() => [window.innerWidth, window.innerHeight])
    useEffect(() => {
        setAnchor(rowRef.current?.querySelector<HTMLElement>('button[aria-label^="Actions"]') ?? null)
        const onResize = () => setSize([window.innerWidth, window.innerHeight])
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])
    return (
        <Ground width={360} pad={18} style={{minHeight: 300}}>
            <div ref={rowRef}>
                <ListRow title="The empty room" date="Jun 22" unread dots onClick={() => undefined}
                         meta={<><Icon name="star" size={12}/>4</>}/>
            </div>
            <ListRow title="Notes on forgetting" date="Jun 18" dim meta={<><Icon name="star" size={12}/>6</>}/>
            {anchor && size[0] > 0 && size[1] > 0 && (
                <ItemMenu key={size.join('x')} anchor={anchor} label="Actions for The empty room" title="The empty room"
                          onClose={() => undefined}
                          actions={[
                              {label: 'Rename', onSelect: () => undefined},
                              {label: 'Delete', danger: true, disabled: deleteDisabled, onSelect: () => undefined},
                          ]}/>
            )}
        </Ground>
    )
}

export const RenameDelete = () => <Anchored/>

export const DeleteWhileStreaming = () => <Anchored deleteDisabled/>
