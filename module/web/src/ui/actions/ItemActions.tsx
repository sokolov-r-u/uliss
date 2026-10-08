import {type ReactNode, useCallback, useLayoutEffect, useRef, useState} from 'react'
import {Dialog, ItemMenu, type ItemMenuAction, Notice, TextField} from '@uliss/design-system'
import {AuthRequiredError} from '../../auth/apiClient'
import {ChatApiError, deleteChat, notifyChatListChanged, renameChat} from '../../chat/chatApi'
import {deleteNote, NoteApiError, renameNote} from '../../notes/noteApi'
import {NoticeOverlay} from '../notice/NoticeOverlay'

export type ItemActionTarget =
    | { kind: 'chat'; id: string; title: string; noteCount: number }
    | { kind: 'note'; id: string; title: string; renamable: boolean }

export interface ItemActionsProps {
    target: ItemActionTarget
    onRenamed?: (title: string) => void
    onDeleted?: () => void
    /** Greys Delete, e.g. while this chat's reply is streaming. */
    deleteDisabled?: boolean
    /** Fixture-only: render with the menu already open. */
    initialOpen?: boolean
    children: (openMenu: (anchor: HTMLElement) => void, menuOpen: boolean) => ReactNode
}

const TITLE_LIMIT = 50

/** Mirrors the server rule: trimmed, whitespace runs collapsed, 1–50 code points. */
function normalizeTitle(raw: string): string | null {
    const title = raw.trim().replace(/\s+/g, ' ')
    const length = Array.from(title).length
    return length > 0 && length <= TITLE_LIMIT ? title : null
}

export function deleteChatBody(noteCount: number): string | undefined {
    if (noteCount <= 0) return undefined
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

    const openMenu = useCallback((element: HTMLElement) => setAnchor(element), [])
    const closeMenu = useCallback(() => setAnchor(null), [])
    const closeDialog = useCallback(() => {
        if (pendingRef.current) return
        setDialog(null)
        setError(null)
    }, [])

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
            const saved = target.kind === 'chat'
                ? (await renameChat(target.id, title)).title
                : (await renameNote(target.id, title)).title ?? title
            if (target.kind === 'chat') notifyChatListChanged()
            finish()
            setDialog(null)
            onRenamed?.(saved)
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
        // Either delete changes chat note counts.
        notifyChatListChanged()
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
            {anchor && <ItemMenu anchor={anchor} label={`Actions for ${target.title}`} title={target.title}
                                 actions={actions} onClose={closeMenu}/>}
            {dialog === 'rename' && <NoticeOverlay blocking={pending} onBackdropClick={closeDialog}>
                <Notice title={target.kind === 'chat' ? 'Rename chat' : 'Rename note'}
                        body={error ?? undefined}
                        primary={pending ? 'Saving…' : 'Save'} secondary="Cancel" busy={pending}
                        primaryDisabled={pending || normalizeTitle(draft) === null}
                        onPrimary={() => void submitRename()} onSecondary={closeDialog}>
                    <TextField label="Title" value={draft} maxLength={TITLE_LIMIT} autoFocus
                               onChange={(event) => setDraft(event.target.value)}
                               onKeyDown={(event) => {
                                   if (event.key === 'Enter') void submitRename()
                               }}/>
                </Notice>
            </NoticeOverlay>}
            {dialog === 'delete' && <Dialog danger title={`Delete “${target.title}”?`}
                                            body={error ?? (target.kind === 'chat' ? deleteChatBody(target.noteCount) : undefined)}
                                            confirm={pending ? 'Deleting…' : 'Delete'} cancel="Cancel"
                                            onConfirm={() => void submitDelete()} onCancel={closeDialog}/>}
        </div>
    )
}
