import {useState} from 'react'
import {Button, Dialog, Disclosure, FieldMessage, Icon, IconButton, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../../auth/apiClient'
import {type Note, type NotePoster, removeNotePoster} from '../noteApi'
import {CropPosterDialog} from './CropPosterDialog'
import {PosterEditor} from './PosterEditor'
import {SavedPoster} from './SavedPoster'
import {usePosterSectionOpen} from './usePosterSectionOpen'
import {notePosterMessages} from './notePoster.messages'

/**
 * The Poster section of a note's details panel (PROT Note poster): an Add button, the link editor (the 2:3 frame with a
 * live preview over the link field), or the saved poster with Crop, Change and Remove as icons in the section header.
 * The browser loads and measures the image; the service only stores the link and the crop frames. [onChanged] hands
 * the stored poster (none after Remove) to the owner of [note], which shows it.
 */
export function NotePosterSection({note, onChanged}: {
    note: Pick<Note, 'id' | 'title' | 'poster'>
    onChanged: (poster: NotePoster | undefined) => void
}) {
    const t = useMessages(notePosterMessages)
    const [open, setOpen] = usePosterSectionOpen()
    // the shown note is the truth: a reload of it, or a change saved here, comes back through [note]
    const poster = note.poster
    const [editing, setEditing] = useState(false)
    const [cropping, setCropping] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [removeFailed, setRemoveFailed] = useState(false)

    const stored = (next: NotePoster | undefined) => {
        setEditing(false)
        setCropping(false)
        onChanged(next)
    }

    const remove = async () => {
        setRemoving(true)
        try {
            await removeNotePoster(note.id)
            setConfirming(false)
            stored(undefined)
        } catch (error) {
            if (error instanceof AuthRequiredError) return
            setConfirming(false)
            setRemoveFailed(true)
        } finally {
            setRemoving(false)
        }
    }

    // the crop, the pencil and the bin act on a saved poster; the editor has its own Save and Cancel
    const actions = poster && !editing ? <>
        <IconButton title={t.cropPoster} onClick={() => {
            setRemoveFailed(false)
            setCropping(true)
        }}><Icon name="crop" size={14}/></IconButton>
        <IconButton title={t.changePoster} onClick={() => {
            setRemoveFailed(false)
            setEditing(true)
        }}><Icon name="edit" size={14}/></IconButton>
        <IconButton title={t.removePoster} onClick={() => {
            setRemoveFailed(false)
            setConfirming(true)
        }}><Icon name="trash" size={14}/></IconButton>
    </> : undefined

    return <section className="context-section note-poster" aria-label={t.poster}>
        <Disclosure variant="section" title={t.poster} open={open} onToggle={setOpen} actions={actions}>
            <div className="note-poster-body">
                {editing
                    ? <PosterEditor noteId={note.id} initial={poster} onSaved={stored}
                                    onCancel={() => setEditing(false)}/>
                    : poster
                        ? <SavedPoster title={note.title} poster={poster}/>
                        : <Button variant="outline" full onClick={() => setEditing(true)}>{t.addPoster}</Button>}
                {removeFailed && !editing && <FieldMessage text={t.removeFailed} tone="error"/>}
            </div>
        </Disclosure>
        {cropping && poster && <CropPosterDialog noteId={note.id} title={note.title} poster={poster}
                                                 onSaved={stored} onClose={() => setCropping(false)}/>}
        {confirming && <Dialog danger title={t.removeTitle} body={t.removeBody} confirm={t.remove} cancel={t.keep}
                               busy={removing} confirmDisabled={removing} onConfirm={() => void remove()}
                               onCancel={() => setConfirming(false)}/>}
    </section>
}
