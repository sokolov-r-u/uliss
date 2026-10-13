import {Dialog, Icon, ListRow, TextField} from '@uliss/design-system'
import {useState} from 'react'
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
        <Dialog danger title="Delete “The empty room”?" confirm="Delete" cancel="Cancel"
                onConfirm={() => undefined} onCancel={() => undefined}/>
    </>
)

export const DeleteChat = () => (
    <>
        <Behind/>
        <Dialog danger title="Delete “Planning the autumn walk”?"
                body="Uliss wrote 2 notes from this chat. They will stay — delete them from Notes if you no longer need them."
                confirm="Delete" cancel="Cancel" onConfirm={() => undefined} onCancel={() => undefined}/>
    </>
)

export const RenameNote = () => {
    const [title, setTitle] = useState('The empty room')
    return (
        <>
            <Behind/>
            <Dialog title="Rename note" confirm="Save" cancel="Cancel" confirmDisabled={!title.trim()}
                    onConfirm={() => undefined} onCancel={() => undefined}>
                <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)}
                           maxLength={50}/>
            </Dialog>
        </>
    )
}
