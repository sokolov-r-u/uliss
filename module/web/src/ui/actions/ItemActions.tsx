import {type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Dialog, ItemMenu, type ItemMenuAction, OptionList, TextField} from '@uliss/design-system'
import {describeError} from '../../lib/apiHelpers'
import {useLocation, useNavigate} from 'react-router-dom'
import {AuthRequiredError} from '../../auth/apiClient'
import {ChatApiError, deleteChat, notifyChatListChanged, renameChat} from '../../chat/chatApi'
import {normalizeTitle, TITLE_LIMIT} from '../../lib/titleRule'
import {ChatNotesList} from '../links/ChatNotesList'
import {
    BACK_TO_DELETE_DIALOG_STATE,
    DELETE_CHAT_PARAM,
    DELETE_HOST_PARAM,
    type DeleteDialogHost,
} from './deleteDialogReturn'
import {
    deleteNote,
    listSubNotes,
    type Note,
    NoteApiError,
    notifyNotesChanged,
    renameNote,
    type SubNoteFate,
} from '../../notes/noteApi'

export type ItemActionTarget =
    | { kind: 'chat'; id: string; title: string; noteCount: number }
    | { kind: 'note'; id: string; title: string; renamable: boolean }

export interface ItemActionsProps {
    target: ItemActionTarget
    /** A renamed note also comes back whole: renaming bumps its version. */
    onRenamed?: (title: string, note?: Note) => void
    onDeleted?: () => void
    /** Greys Delete, e.g. while this chat's reply is streaming. */
    deleteDisabled?: boolean
    /** Where this chat's menu sits; with it, a note opened from the delete dialog can come back to the dialog. */
    dialogHost?: DeleteDialogHost
    /** Fixture-only: render with the menu already open. */
    initialOpen?: boolean
    children: (openMenu: (anchor: HTMLElement) => void, menuOpen: boolean) => ReactNode
}

/** Room for a listed note's full title (up to 50 code points) beside its date; the screen narrows it on a phone. */
const NOTE_LIST_DIALOG_WIDTH = 460

/** The sub-notes a deleted note would leave: counted when its dialog opens. */
type SubNotes = { status: 'loading' } | { status: 'error' } | { status: 'ready'; count: number }

const FATES: { fate: SubNoteFate; label: string; note: string }[] = [
    {fate: 'KEEP', label: 'Keep sub-notes', note: 'They take its place'},
    {fate: 'DELETE', label: 'Delete all', note: 'The note with all its sub-notes'},
]

export function deleteNoteBody(title: string, count: number): string {
    const subNotes = count === 1 ? 'a sub-note' : `${count} sub-notes`
    return `“${title}” has ${subNotes}. Kept sub-notes move up to its place; chats are never deleted.`
}

export function deleteChatBody(noteCount: number): string {
    if (noteCount <= 0) return 'No notes were written from it. The conversation does not come back.'
    if (noteCount === 1) {
        return 'Uliss wrote a note from this chat. It will stay — delete it from Notes if you no longer need it.'
    }
    return `Uliss wrote ${noteCount} notes from this chat. They will stay — delete them from Notes if you no longer need them.`
}

function failureStatus(error: unknown): number | undefined {
    if (error instanceof ChatApiError || error instanceof NoteApiError) return error.status
    return undefined
}

function failureMessage(target: ItemActionTarget, error: unknown): string {
    const status = failureStatus(error)
    if (status === 409) {
        return target.kind === 'chat' ? 'Stop the reply before deleting this chat.' : 'This note is still being written.'
    }
    if (status === 404) return target.kind === 'chat' ? 'This chat no longer exists.' : 'This note no longer exists.'
    if (status === 400) return 'Use a title of 1 to 50 characters.'
    return describeError(error)
}

/** Rename · Delete for one chat or note: menu, dialogs, API calls and in-dialog errors. */
export function ItemActions({
                                target,
                                onRenamed,
                                onDeleted,
                                deleteDisabled = false,
                                dialogHost,
                                initialOpen = false,
                                children,
                            }: ItemActionsProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const pendingRef = useRef(false)
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
    const [draft, setDraft] = useState(target.title)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [subNotes, setSubNotes] = useState<SubNotes>({status: 'loading'})
    const [fate, setFate] = useState<SubNoteFate>('KEEP')
    const [subNotesRevision, setSubNotesRevision] = useState(0)

    // A note's delete dialog asks about its sub-notes, so it counts them first.
    useEffect(() => {
        if (dialog !== 'delete' || target.kind !== 'note') return
        const controller = new AbortController()
        setSubNotes({status: 'loading'})
        listSubNotes(target.id, controller.signal)
            .then((notes) => setSubNotes({status: 'ready', count: notes.length}))
            .catch((e) => {
                if (!controller.signal.aborted && !(e instanceof AuthRequiredError)) setSubNotes({status: 'error'})
            })
        return () => controller.abort()
    }, [dialog, target.kind, target.id, subNotesRevision])

    useLayoutEffect(() => {
        if (initialOpen && hostRef.current) setAnchor(hostRef.current)
    }, [initialOpen])

    const navigate = useNavigate()
    const location = useLocation()

    // Back from a note opened in this dialog: reopen it, then drop the marker so closing it leaves a plain URL.
    useEffect(() => {
        if (target.kind !== 'chat' || !dialogHost) return
        const params = new URLSearchParams(location.search)
        if (params.get(DELETE_CHAT_PARAM) !== target.id || params.get(DELETE_HOST_PARAM) !== dialogHost) return
        setError(null)
        setDialog('delete')
        params.delete(DELETE_CHAT_PARAM)
        params.delete(DELETE_HOST_PARAM)
        const search = params.toString()
        navigate({pathname: location.pathname, search: search ? `?${search}` : ''}, {replace: true})
    }, [location.pathname, location.search, target.kind, target.id, dialogHost, navigate])

    const openMenu = useCallback((element: HTMLElement) => setAnchor(element), [])
    const closeMenu = useCallback(() => setAnchor(null), [])
    const closeDialog = useCallback(() => {
        if (pendingRef.current) return
        setDialog(null)
        setError(null)
    }, [])

    function openNote(noteId: string) {
        if (pendingRef.current) return
        setDialog(null)
        if (!dialogHost || target.kind !== 'chat') {
            navigate(`/notes/${noteId}`)
            return
        }
        // Mark this screen's history entry with the open dialog, then leave it for the note.
        const params = new URLSearchParams(location.search)
        params.set(DELETE_CHAT_PARAM, target.id)
        params.set(DELETE_HOST_PARAM, dialogHost)
        navigate({pathname: location.pathname, search: `?${params}`}, {replace: true})
        navigate(`/notes/${noteId}`, {state: BACK_TO_DELETE_DIALOG_STATE})
    }

    function begin(): boolean {
        if (pendingRef.current) return false
        pendingRef.current = true
        setPending(true)
        setError(null)
        return true
    }

    function finish() {
        pendingRef.current = false
        setPending(false)
    }

    async function submitRename() {
        const title = normalizeTitle(draft)
        if (title === null || !begin()) return
        try {
            const renamedNote = target.kind === 'note' ? await renameNote(target.id, title) : undefined
            const saved = renamedNote ? renamedNote.title ?? title : (await renameChat(target.id, title)).title
            if (target.kind === 'chat') notifyChatListChanged()
            else notifyNotesChanged()
            finish()
            setDialog(null)
            if (renamedNote) onRenamed?.(saved, renamedNote)
            else onRenamed?.(saved)
        } catch (e) {
            finish()
            if (!(e instanceof AuthRequiredError)) setError(failureMessage(target, e))
        }
    }

    async function submitDelete() {
        if (!begin()) return
        try {
            if (target.kind === 'chat') await deleteChat(target.id)
            else await deleteNote(target.id, subNotes.status === 'ready' && subNotes.count > 0 ? fate : undefined)
        } catch (e) {
            if (e instanceof NoteApiError && e.code === 'NOTE_HAS_SUB_NOTES') {
                // A sub-note appeared after the dialog counted them: count again and ask.
                finish()
                setFate('KEEP')
                setSubNotesRevision((value) => value + 1)
                return
            }
            // Already gone (e.g. deleted in another tab) is the outcome the user asked for.
            if (failureStatus(e) !== 404) {
                finish()
                if (!(e instanceof AuthRequiredError)) setError(failureMessage(target, e))
                return
            }
        }
        // Either delete changes chat lists (membership or note counts); only a note delete changes note lists.
        notifyChatListChanged()
        if (target.kind === 'note') notifyNotesChanged()
        finish()
        setDialog(null)
        onDeleted?.()
    }

    const actions: ItemMenuAction[] = []
    if (target.kind === 'chat' || target.renamable) {
        actions.push({
            label: 'Rename',
            onSelect: () => {
                setAnchor(null)
                setDraft(target.title)
                setError(null)
                setDialog('rename')
            },
        })
    }
    actions.push({
        label: 'Delete',
        danger: true,
        disabled: deleteDisabled,
        onSelect: () => {
            setAnchor(null)
            setError(null)
            setFate('KEEP')
            setDialog('delete')
        },
    })

    return (
        <div ref={hostRef} style={{minWidth: 0}}>
            {children(openMenu, anchor !== null)}
            {anchor && <ItemMenu anchor={anchor} label={`Actions for ${target.title}`}
                                 actions={actions} onClose={closeMenu}/>}
            {dialog === 'rename' && <Dialog title={target.kind === 'chat' ? 'Rename chat' : 'Rename note'}
                                            body={error ?? undefined}
                                            confirm={pending ? 'Saving…' : 'Save'} cancel="Cancel" busy={pending}
                                            confirmDisabled={pending || normalizeTitle(draft) === null}
                                            onConfirm={() => void submitRename()} onCancel={closeDialog}
                                            width={320}>
                <TextField label="Title" value={draft} maxLength={TITLE_LIMIT} autoFocus
                           onChange={(event) => setDraft(event.target.value)}
                           onKeyDown={(event) => {
                               if (event.key === 'Enter') void submitRename()
                           }}/>
            </Dialog>}
            {dialog === 'delete' && target.kind === 'note' && subNotes.status === 'ready' && subNotes.count > 0
                && <Dialog danger title={`Delete “${target.title}”?`} width={340}
                           body={error ?? deleteNoteBody(target.title, subNotes.count)}
                           confirm={pending ? 'Deleting…' : 'Delete'} cancel="Cancel" busy={pending}
                           confirmDisabled={pending}
                           onConfirm={() => void submitDelete()} onCancel={closeDialog}>
                    <OptionList label="Sub-notes" marker="dot" disabled={pending}
                                selected={FATES.findIndex((item) => item.fate === fate)}
                                options={FATES.map((item) => ({label: item.label, note: item.note}))}
                                onPick={(index) => setFate(FATES[index]!.fate)}/>
                </Dialog>}
            {dialog === 'delete' && !(target.kind === 'note' && subNotes.status === 'ready' && subNotes.count > 0)
                && <Dialog danger title={`Delete “${target.title}”?`}
                                            body={error ?? (target.kind === 'chat' ? deleteChatBody(target.noteCount) : undefined)}
                                            confirm={pending ? 'Deleting…' : 'Delete'} cancel="Cancel"
                                            confirmDisabled={target.kind === 'note' && subNotes.status === 'loading'}
                                            onConfirm={() => void submitDelete()} onCancel={closeDialog}
                                            width={target.kind === 'chat' && target.noteCount > 0 ? NOTE_LIST_DIALOG_WIDTH : undefined}>
                {/* The notes that stay: open one to delete it by hand before (or instead of) the chat. */}
                {target.kind === 'chat' && target.noteCount > 0
                    && <ChatNotesList chatId={target.id} onOpen={openNote} empty={null}/>}
            </Dialog>}
        </div>
    )
}
