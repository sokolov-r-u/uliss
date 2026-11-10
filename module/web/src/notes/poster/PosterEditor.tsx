import {type ChangeEvent, useEffect, useId, useState} from 'react'
import {Button, FieldMessage, type FieldMessageTone, PosterFrame, TextField, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../../auth/apiClient'
import {type NotePoster, setNotePoster} from '../noteApi'
import {checkPosterLink, POSTER_LINK_MAX} from './posterLink'
import {posterEditorView} from './posterEditorView'
import {type ImageProbe, useImageProbe} from './useImageProbe'
import {notePosterMessages} from './notePoster.messages'

/** The pause after the last keystroke before the browser is asked to load the link. */
const PREVIEW_DELAY_MS = 400

type Saving = 'idle' | 'saving' | 'failed'

/**
 * The poster link editor: the 2:3 frame previews the link as it will show, the field under it holds the link, and Save
 * waits for an image the browser loaded and measured. [initial] is the stored poster when changing one: saving its
 * link again keeps its crop, another link starts from the centred defaults.
 */
export function PosterEditor({noteId, initial, onSaved, onCancel}: {
    noteId: string
    initial?: NotePoster
    onSaved: (poster: NotePoster) => void
    onCancel: () => void
}) {
    const t = useMessages(notePosterMessages)
    const messageId = useId()
    const [typed, setTyped] = useState(initial?.url ?? '')
    const [saving, setSaving] = useState<Saving>('idle')
    const check = checkPosterLink(typed)
    const href = check.kind === 'ok' ? check.href : null
    // the browser loads the link only after typing pauses
    const [probeSrc, setProbeSrc] = useState<string | null>(href)
    useEffect(() => {
        if (href === probeSrc) return
        if (!href) {
            setProbeSrc(null)
            return
        }
        const timer = window.setTimeout(() => setProbeSrc(href), PREVIEW_DELAY_MS)
        return () => window.clearTimeout(timer)
    }, [href, probeSrc])
    const probe = useImageProbe(probeSrc)

    // a probe of an earlier link, or one not started yet, reads as loading
    const current: ImageProbe = href && probe.status !== 'idle' && probe.src === href ? probe
        : {status: 'loading', src: href ?? ''}
    const view = posterEditorView(check.kind, current, t)
    const fits = view.ready && saving !== 'saving'
    const message: [string, FieldMessageTone] = saving === 'saving' ? [t.saving, 'busy']
        : saving === 'failed' && view.ready ? [t.saveFailed, 'error'] : view.message

    const save = async () => {
        if (!href || !fits) return
        setSaving('saving')
        try {
            const crop = href === initial?.url ? initial.crop : undefined
            const note = await setNotePoster(noteId, href, crop)
            onSaved(note.poster ?? {url: href, ...(crop ? {crop} : {})})
        } catch (error) {
            if (error instanceof AuthRequiredError) return
            setSaving('failed')
        }
    }

    return <form className="note-poster-editor" onSubmit={(event) => {
        event.preventDefault()
        void save()
    }}>
        <PosterFrame state={view.frame} src={href ?? undefined} badge={view.badge}/>
        {/* a soft limit: the field's default maxLength (24) would cut a link, and a link is pasted whole */}
        <TextField label={t.imageLink} placeholder="https://…" type="url" inputMode="url" autoFocus value={typed}
                   limit={POSTER_LINK_MAX}
                   aria-invalid={view.invalid} aria-describedby={messageId} disabled={saving === 'saving'}
                   onChange={(event: ChangeEvent<HTMLInputElement>) => {
                       setTyped(event.target.value)
                       setSaving('idle')
                   }}/>
        <FieldMessage id={messageId} text={message[0]} tone={message[1]}/>
        <div className="note-poster-editor-actions">
            <Button type="submit" variant="primary" full disabled={!fits} aria-busy={saving === 'saving'}>
                {saving === 'saving' ? t.saving : t.save}
            </Button>
            <Button variant="ghost" disabled={saving === 'saving'} onClick={onCancel}>{t.cancel}</Button>
        </div>
    </form>
}
