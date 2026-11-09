import {type ChangeEvent, useEffect, useId, useState} from 'react'
import {
    Button,
    Dialog,
    Disclosure,
    FieldMessage,
    type FieldMessageTone,
    Icon,
    IconButton,
    PosterFrame,
    type PosterFrameState,
    TextField,
    useMessages,
} from '@uliss/design-system'
import {AuthRequiredError} from '../../auth/apiClient'
import {type Note, removeNotePoster, setNotePoster} from '../noteApi'
import {checkPosterLink, POSTER_LINK_MAX, POSTER_MIN_SIDE, posterHost} from './posterLink'
import {type ImageProbe, useImageProbe} from './useImageProbe'
import {usePosterSectionOpen} from './usePosterSectionOpen'
import {notePosterMessages} from './notePoster.messages'

/** The pause after the last keystroke before the browser is asked to load the link. */
const PREVIEW_DELAY_MS = 400

type Saving = 'idle' | 'saving' | 'failed'

/**
 * The Poster section of a note's details panel (PROT Note poster): an Add button, the link editor (the 2:3 frame with a
 * live preview over the link field), or the saved poster with Change and Remove as icons in the section header. The browser loads and measures the image; the service only
 * stores the link. [onChanged] hands the stored link (none after Remove) to the panel's owner.
 */
export function NotePosterSection({note, onChanged}: {
    note: Pick<Note, 'id' | 'title' | 'posterUrl'>
    onChanged?: (posterUrl: string | undefined) => void
}) {
    const t = useMessages(notePosterMessages)
    const [open, setOpen] = usePosterSectionOpen()
    const [posterUrl, setPosterUrl] = useState(note.posterUrl)
    const [editing, setEditing] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [removeFailed, setRemoveFailed] = useState(false)

    const stored = (next: string | undefined) => {
        setPosterUrl(next)
        setEditing(false)
        onChanged?.(next)
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

    // the pencil and the bin act on a saved poster; the editor has its own Save and Cancel
    const actions = posterUrl && !editing ? <>
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
                    ? <PosterEditor noteId={note.id} initial={posterUrl ?? ''} onSaved={stored}
                                    onCancel={() => setEditing(false)}/>
                    : posterUrl
                        ? <SavedPoster title={note.title} posterUrl={posterUrl}/>
                        : <Button variant="outline" full onClick={() => setEditing(true)}>{t.addPoster}</Button>}
                {removeFailed && !editing && <FieldMessage text={t.removeFailed} tone="error"/>}
            </div>
        </Disclosure>
        {confirming && <Dialog danger title={t.removeTitle} body={t.removeBody} confirm={t.remove} cancel={t.keep}
                               busy={removing} confirmDisabled={removing} onConfirm={() => void remove()}
                               onCancel={() => setConfirming(false)}/>}
    </section>
}

function PosterEditor({noteId, initial, onSaved, onCancel}: {
    noteId: string
    initial: string
    onSaved: (posterUrl: string) => void
    onCancel: () => void
}) {
    const t = useMessages(notePosterMessages)
    const messageId = useId()
    const [typed, setTyped] = useState(initial)
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
    const view = editorView(check.kind, current, t)
    const fits = view.ready && saving !== 'saving'
    const message: [string, FieldMessageTone] = saving === 'saving' ? [t.saving, 'busy']
        : saving === 'failed' && view.ready ? [t.saveFailed, 'error'] : view.message

    const save = async () => {
        if (!href || !fits) return
        setSaving('saving')
        try {
            const note = await setNotePoster(noteId, href)
            onSaved(note.posterUrl ?? href)
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

interface EditorView {
    frame: PosterFrameState
    message: [string, FieldMessageTone]
    invalid: boolean
    /** The image loaded and is big enough: it may be saved. */
    ready: boolean
    badge?: string
}

function editorView(
    check: ReturnType<typeof checkPosterLink>['kind'],
    probe: ImageProbe,
    t: (typeof notePosterMessages)['en'],
): EditorView {
    const refused = (text: string): EditorView => ({frame: 'hint', message: [text, 'error'], invalid: true, ready: false})
    if (check === 'empty') return {frame: 'hint', message: [t.hint, 'hint'], invalid: false, ready: false}
    if (check === 'not-https') return refused(t.httpsOnly)
    if (check === 'credentials') return refused(t.credentials)
    if (check === 'too-long') return refused(t.tooLong)
    if (probe.status === 'error') {
        return {frame: 'broken', message: [t.couldNotLoad, 'error'], invalid: true, ready: false}
    }
    if (probe.status !== 'loaded') return {frame: 'loading', message: [t.loading, 'busy'], invalid: false, ready: false}
    const {width, height} = probe
    if (Math.min(width, height) < POSTER_MIN_SIDE) {
        return {
            frame: 'small', message: [t.tooSmall(width, height, POSTER_MIN_SIDE), 'error'], invalid: true, ready: false,
            badge: `${width} × ${height}`,
        }
    }
    return {frame: 'image', message: [t.fits(width, height), 'ok'], invalid: false, ready: true}
}

function SavedPoster({title, posterUrl}: { title?: string; posterUrl: string }) {
    const t = useMessages(notePosterMessages)
    // a saved link that stopped loading; a new link starts over
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    return <PosterFrame state={failedUrl === posterUrl ? 'unavailable' : 'image'} src={posterUrl}
                        alt={title ? t.alt(title) : t.untitledAlt} host={posterHost(posterUrl)}
                        onImageError={() => setFailedUrl(posterUrl)}/>
}
