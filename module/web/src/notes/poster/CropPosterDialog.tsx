import {useState} from 'react'
import {
    type CropMode,
    Dialog,
    FieldMessage,
    fitCrop,
    type PosterCrop,
    PosterCropper,
    useMessages,
} from '@uliss/design-system'
import {AuthRequiredError} from '../../auth/apiClient'
import {type NotePoster, setNotePoster} from '../noteApi'
import {useImageProbe} from './useImageProbe'
import {notePosterMessages} from './notePoster.messages'

type Saving = 'idle' | 'saving' | 'failed'

/** What the cropper shows before the image's size is known; never saved. */
const NO_CROP: PosterCrop = {poster: {x: 0, y: 0, w: 1, h: 1}, avatar: {x: 0, y: 0, w: 1, h: 1}}

/**
 * Crops the saved poster: the panel's 2:3 frame and the sky avatar's circle, saved together with the same link. The
 * browser loads the image to learn its size; a stored crop is fitted to it, none starts from the centred defaults.
 * While the save runs the dialog cannot be closed; a failed save keeps the frames for another try.
 */
export function CropPosterDialog({noteId, title, poster, onSaved, onClose}: {
    noteId: string
    title?: string
    poster: NotePoster
    onSaved: (poster: NotePoster) => void
    onClose: () => void
}) {
    const t = useMessages(notePosterMessages)
    const probe = useImageProbe(poster.url)
    const [mode, setMode] = useState<CropMode>('poster')
    const [edited, setEdited] = useState<PosterCrop | null>(null)
    const [saving, setSaving] = useState<Saving>('idle')
    const loaded = probe.status === 'loaded' && probe.src === poster.url ? probe : null
    const crop = edited ?? (loaded ? fitCrop(poster.crop, loaded.width, loaded.height) : NO_CROP)

    const save = async () => {
        if (!loaded || saving === 'saving') return
        setSaving('saving')
        try {
            const note = await setNotePoster(noteId, poster.url, crop)
            onSaved(note.poster ?? {url: poster.url, crop})
        } catch (error) {
            if (error instanceof AuthRequiredError) return
            setSaving('failed')
        }
    }

    return <Dialog title={t.cropPoster} confirm={t.save} cancel={t.cancel} width={680}
                   busy={saving === 'saving'} confirmDisabled={!loaded || saving === 'saving'}
                   cancelDisabled={saving === 'saving'} onConfirm={() => void save()} onCancel={onClose}>
        <PosterCropper src={poster.url} title={title} mode={mode} onModeChange={setMode} value={crop}
                       status={loaded ? 'ready' : probe.status === 'error' ? 'unavailable' : 'loading'}
                       imageWidth={loaded?.width} imageHeight={loaded?.height} disabled={saving === 'saving'}
                       onChange={(next) => {
                           setEdited(next)
                           if (saving === 'failed') setSaving('idle')
                       }}/>
        <FieldMessage lines={1} text={saving === 'saving' ? t.saving : saving === 'failed' ? t.cropSaveFailed : ''}
                      tone={saving === 'saving' ? 'busy' : 'error'}/>
    </Dialog>
}
