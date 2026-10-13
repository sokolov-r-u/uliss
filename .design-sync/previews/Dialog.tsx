import {Dialog, Icon, ListRow} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

// Dialog renders a fixed full-viewport overlay; the rows behind it stand in for the live screen.
const Behind = () => (
    <Ground pad={18} style={{minHeight: 420}}>
        <ListRow title="The empty room" date="Jun 22" unread meta={<><Icon name="star" size={12}/>4</>}/>
        <ListRow title="Notes on forgetting" date="Jun 18" dim meta={<><Icon name="star" size={12}/>6</>}/>
        <ListRow title="Planning the autumn walk" date="Jun 14" dim meta={<><Icon name="star" size={12}/>1</>}/>
    </Ground>
)

export const Summarize = () => (
    <>
        <Behind/>
        <Dialog title="Summarize this chat?"
                body="Uliss will fold the conversation into a note — the one linked here, or a new one if there is none yet."
                confirm="Summarize" cancel="Not now" onConfirm={() => undefined} onCancel={() => undefined}/>
    </>
)

export const DeleteNote = () => (
    <>
        <Behind/>
        <Dialog danger title="Delete “The empty room”?"
                body="The note goes. The chats it came from stay, and so do its constellations."
                confirm="Delete" cancel="Keep" onConfirm={() => undefined} onCancel={() => undefined}/>
    </>
)
