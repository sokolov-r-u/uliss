import {useState} from 'react'
import {Dialog} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {describeError} from '../lib/apiHelpers'
import {generateClientUuid} from '../lib/clientUuid'
import {type Note, NoteApiError, resummarizeNote} from './noteApi'

const BODY = 'Uliss rewrites the text from the whole chat. Your edits and additions are replaced; the title, icon and ' +
    'place stay.'

function failureMessage(error: unknown): string {
    if (error instanceof NoteApiError && error.kind === 'http') {
        if (error.code === 'SUMMARY_IN_PROGRESS') return 'Uliss is already writing a note from this chat. Try again when it is done.'
        if (error.code === 'NOTE_NOT_RESUMMARIZABLE') return 'The chat of this note is gone, so it cannot be summarized again.'
        if (error.code === 'NOTE_NOT_READY') return 'This note is not ready yet. Try again when it is done.'
        if (error.status === 404) return 'Summarize again is not available any more.'
    }
    return describeError(error)
}

/** Confirms "Summarize again" and sends it; the old text stays readable until the new one replaces it. */
export function ResummarizeDialog({noteId, onQueued, onClose}: {
    noteId: string
    onQueued: (note: Note) => void
    onClose: () => void
}) {
    // one key per opened dialog: a retry after a lost response queues nothing new
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
            if (!(e instanceof AuthRequiredError)) setError(failureMessage(e))
        }
    }

    return <Dialog title="Summarize this note again?" width={340} body={error ?? BODY}
                   confirm={pending ? 'Summarizing…' : 'Summarize'} cancel="Cancel" busy={pending}
                   confirmDisabled={pending} onConfirm={() => void confirm()}
                   onCancel={() => {
                       if (!pending) onClose()
                   }}/>
}
