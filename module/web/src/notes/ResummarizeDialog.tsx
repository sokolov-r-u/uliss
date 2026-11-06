import {useState} from 'react'
import {type Locale, Notice, useLocale, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {describeError} from '../lib/apiHelpers'
import {generateClientUuid} from '../lib/clientUuid'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {type Note, NoteApiError, resummarizeNote} from './noteApi'
import {resummarizeMessages} from './ResummarizeDialog.messages'

function failureMessage(error: unknown, locale: Locale): string {
    const t = resummarizeMessages[locale]
    if (error instanceof NoteApiError && error.kind === 'http') {
        if (error.code === 'SUMMARY_IN_PROGRESS') return t.inProgress
        if (error.code === 'NOTE_NOT_RESUMMARIZABLE') return t.chatGone
        if (error.code === 'NOTE_NOT_READY') return t.notReady
        if (error.status === 404) return t.gone
    }
    return describeError(error, locale)
}

/** Confirms "Summarize again" and sends it; the old text stays readable until the new one replaces it. */
export function ResummarizeDialog({noteId, onQueued, onClose}: {
    noteId: string
    onQueued: (note: Note) => void
    onClose: () => void
}) {
    // one key per opened dialog: a retry after a lost response queues nothing new
    const locale = useLocale()
    const t = useMessages(resummarizeMessages)
    const [idempotencyKey] = useState(generateClientUuid)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function confirm() {
        if (pending) return
        setPending(true)
        setError(null)
        try {
            const note = await resummarizeNote(noteId, idempotencyKey)
            onQueued(note)
        } catch (e) {
            setPending(false)
            if (!(e instanceof AuthRequiredError)) setError(failureMessage(e, locale))
        }
    }

    const close = () => {
        if (!pending) onClose()
    }
    // One text block for the description and every refusal, three lines tall: the card keeps its size.
    return <NoticeOverlay blocking={pending} onBackdropClick={close}>
        <Notice title={t.title} width={340}
                body={<span className={`resummarize-text${error ? ' resummarize-error' : ''}`}>{error ?? t.body}</span>}
                primary={pending ? t.summarizing : t.summarize} secondary={t.cancel} secondaryDisabled={pending}
                busy={pending} primaryDisabled={pending} onPrimary={() => void confirm()} onSecondary={close}/>
    </NoticeOverlay>
}
