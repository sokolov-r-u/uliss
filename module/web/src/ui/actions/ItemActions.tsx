import {type ReactNode, useCallback, useLayoutEffect, useRef, useState} from 'react'
import {Dialog, ItemMenu, type ItemMenuAction, TextField} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import {AuthRequiredError} from '../../auth/apiClient'
import {ChatApiError, deleteChat, notifyChatListChanged, renameChat} from '../../chat/chatApi'
import {normalizeTitle, TITLE_LIMIT} from '../../lib/titleRule'
import {ChatNotesList} from '../links/ChatNotesList'
import {deleteNote, type Note, NoteApiError, notifyNotesChanged, renameNote} from '../../notes/noteApi'

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
    /** Fixture-only: render with the menu already open. */
    initialOpen?: boolean
    children: (openMenu: (anchor: HTMLElement) => void, menuOpen: boolean) => ReactNode
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
    return error instanceof Error ? error.message : String(error)
}

/** Rename · Delete for one chat or note: menu, dialogs, API calls and in-dialog errors. */
export function ItemActions({
                                target,
                                onRenamed,
                                onDeleted,
                                deleteDisabled = false,
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

    useLayoutEffect(() => {
        if (initialOpen && hostRef.current) setAnchor(hostRef.current)
    }, [initialOpen])

    const navigate = useNavigate()
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
        navigate(`/notes/${noteId}`)
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
            else await deleteNote(target.id)
        } catch (e) {
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
            {dialog === 'delete' && <Dialog danger title={`Delete “${target.title}”?`}
                                            body={error ?? (target.kind === 'chat' ? deleteChatBody(target.noteCount) : undefined)}
                                            confirm={pending ? 'Deleting…' : 'Delete'} cancel="Cancel"
                                            onConfirm={() => void submitDelete()} onCancel={closeDialog}>
                {/* The notes that stay: open one to delete it by hand before (or instead of) the chat. */}
                {target.kind === 'chat' && target.noteCount > 0
                    && <ChatNotesList chatId={target.id} onOpen={openNote} empty={null}/>}
            </Dialog>}
        </div>
    )
}
