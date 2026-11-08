import {useLocation, useNavigate} from 'react-router-dom'
import {useMessages} from '@uliss/design-system'
import {ScreenHeader} from '../ui/ScreenHeader'
import {NoteEditForm} from './NoteEditForm'
import './notes.css'
import {notesMessages} from './notes.messages'

/** "New note": the note edit form on an empty note; saving opens the created note in place of this screen. */
export function NoteCreatePage() {
    const navigate = useNavigate()
    const location = useLocation()
    const t = useMessages(notesMessages)
    // opened directly (a link, a reload) there is nothing in the app to go back to
    const close = () => location.key === 'default' ? navigate('/notes', {replace: true}) : navigate(-1)
    return <div className="detail-layout"><div className="note-detail">
        <ScreenHeader back kicker={t.newNote}/>
        <div className="note-detail-body">
            <div className="note-content note-content-editing">
                <NoteEditForm note={null}
                              onSaved={(note) => navigate(`/notes/${encodeURIComponent(note.id)}`, {replace: true})}
                              onClose={close}/>
            </div>
        </div>
    </div></div>
}
