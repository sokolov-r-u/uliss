import {type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Dialog, ItemMenu, type ItemMenuAction, type Locale, noteTitleText, Notice, OptionList, TextField, useLocale, useMessages} from '@uliss/design-system'
import {describeError} from '../../lib/apiHelpers'
import {useLocation, useNavigate} from 'react-router-dom'
import {AuthRequiredError} from '../../auth/apiClient'
import {ChatApiError, deleteChat, notifyChatListChanged, pinChat, renameChat, unpinChat} from '../../chat/chatApi'
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
    pinNote,
    renameNote,
    type SubNoteFate,
    unpinNote,
} from '../../notes/noteApi'
import {NoticeOverlay} from '../notice/NoticeOverlay'
import {PIN_LIMIT, pinnedChats, pinnedNotes, usePinnedIds} from '../pins/pinned'
import {commonMessages} from '../../i18n/common.messages'
import {itemActionsMessages} from './itemActions.messages'

export type ItemActionTarget =
    | { kind: 'chat'; id: string; title: string; noteCount: number }
    | { kind: 'note'; id: string; title: string; renamable: boolean; icon?: string | null }

export interface ItemActionsProps {
    target: ItemActionTarget
    /** A renamed note also comes back whole: renaming bumps its version. */
    onRenamed?: (title: string, note?: Note) => void
    onDeleted?: () => void
    /** Greys Delete, e.g. while this chat's reply is streaming. */
    deleteDisabled?: boolean
    /** Where this chat's menu sits; with it, a note opened from the delete dialog can come back to the dialog. */
    dialogHost?: DeleteDialogHost
    /** Items of the screen's own between Rename and Delete; each opens that screen's dialog. */
    extraActions?: ItemMenuAction[]
    /** Fixture-only: render with the menu already open. */
    initialOpen?: boolean
    children: (openMenu: (anchor: HTMLElement) => void, menuOpen: boolean) => ReactNode
}

/** Room for a listed note's full title (up to 50 code points) beside its date; the screen narrows it on a phone. */
const NOTE_LIST_DIALOG_WIDTH = 460

/** The sub-notes a deleted note would leave: counted when its dialog opens. */
type SubNotes = { status: 'loading' } | { status: 'error' } | { status: 'ready'; count: number }

type ActionWords = typeof itemActionsMessages.en

const FATES: { fate: SubNoteFate; label: 'keepSubNotes' | 'deleteAll'; note: 'keepSubNotesNote' | 'deleteAllNote' }[] = [
    {fate: 'KEEP', label: 'keepSubNotes', note: 'keepSubNotesNote'},
    {fate: 'DELETE', label: 'deleteAll', note: 'deleteAllNote'},
]

export function deleteNoteBody(title: string, count: number, locale: Locale = 'en'): string {
    return itemActionsMessages[locale].deleteNoteBody(title, count)
}

export function deleteChatBody(noteCount: number, locale: Locale = 'en'): string {
    return itemActionsMessages[locale].deleteChatBody(noteCount)
}

function failureStatus(error: unknown): number | undefined {
    if (error instanceof ChatApiError || error instanceof NoteApiError) return error.status
    return undefined
}

/** Why a pin or unpin failed, in the words of the message card. */
export function pinFailureMessage(kind: ItemActionTarget['kind'], error: unknown, locale: Locale = 'en'): string {
    const t = itemActionsMessages[locale]
    const status = failureStatus(error)
    if (status === 409) return t.pinLimit(PIN_LIMIT, kind)
    if (status === 404) return t.gone(kind)
    return describeError(error, locale)
}

function failureMessage(target: ItemActionTarget, error: unknown, t: ActionWords, locale: Locale): string {
    const status = failureStatus(error)
    if (status === 409) return t.busy(target.kind)
    if (status === 404) return t.gone(target.kind)
    if (status === 400) return t.titleRule
    return describeError(error, locale)
}

/** Rename · Delete (and a screen's own items) for one chat or note: menu, dialogs, API calls and in-dialog errors. */
export function ItemActions({
                                target,
                                onRenamed,
                                onDeleted,
                                deleteDisabled = false,
                                dialogHost,
                                extraActions = [],
                                initialOpen = false,
                                children,
                            }: ItemActionsProps) {
    const locale = useLocale()
    const t = useMessages(itemActionsMessages)
    const common = useMessages(commonMessages)
    const hostRef = useRef<HTMLDivElement>(null)
    const pendingRef = useRef(false)
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
    const [draft, setDraft] = useState(target.title)
    // labels name a note with its emoji; the rename draft is the title alone
    const shownTitle = target.kind === 'note' ? noteTitleText(target.title, target.icon) : target.title
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [subNotes, setSubNotes] = useState<SubNotes>({status: 'loading'})
    const [fate, setFate] = useState<SubNoteFate>('KEEP')
    const [subNotesRevision, setSubNotesRevision] = useState(0)
    const pins = usePinnedIds(target.kind)
    const pinned = pins.ids.has(target.id)
    const [pinFailure, setPinFailure] = useState<{ unpin: boolean; message: string } | null>(null)

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
            if (!(e instanceof AuthRequiredError)) setError(failureMessage(target, e, t, locale))
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
                if (!(e instanceof AuthRequiredError)) setError(failureMessage(target, e, t, locale))
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

    async function togglePin(unpin: boolean) {
        if (pendingRef.current) return
        pendingRef.current = true
        try {
            if (unpin) await (target.kind === 'chat' ? unpinChat(target.id) : unpinNote(target.id))
            else if (target.kind === 'chat') pinnedChats.addPinned(await pinChat(target.id))
            else pinnedNotes.addPinned(await pinNote(target.id))
        } catch (e) {
            if (!(e instanceof AuthRequiredError)) setPinFailure({unpin, message: pinFailureMessage(target.kind, e, locale)})
        } finally {
            pendingRef.current = false
        }
        // after a failure too: the lists show what the service holds now (e.g. another tab filled the pins)
        // (the shared pinned list refetches on the same event)
        if (target.kind === 'chat') notifyChatListChanged()
        else notifyNotesChanged()
    }

    const actions: ItemMenuAction[] = [pinned ? {
        label: t.unpin,
        onSelect: () => {
            setAnchor(null)
            void togglePin(true)
        },
    } : {
        // the service refuses one more past the limit; the label says why before it is tried. Until the pinned list
        // has loaded, whether this item is pinned is unknown, so Pin waits for it.
        label: pins.full ? t.pinFull(PIN_LIMIT) : t.pin,
        disabled: !pins.ready || pins.full,
        onSelect: () => {
            setAnchor(null)
            void togglePin(false)
        },
    }]
    if (target.kind === 'chat' || target.renamable) {
        actions.push({
            label: t.rename,
            onSelect: () => {
                setAnchor(null)
                setDraft(target.title)
                setError(null)
                setDialog('rename')
            },
        })
    }
    for (const action of extraActions) {
        actions.push({
            ...action,
            onSelect: () => {
                setAnchor(null)
                action.onSelect()
            },
        })
    }
    actions.push({
        label: t.delete,
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
            {anchor && <ItemMenu anchor={anchor} label={common.actionsFor(shownTitle)}
                                 actions={actions} onClose={closeMenu}/>}
            {pinFailure && <NoticeOverlay onBackdropClick={() => setPinFailure(null)}>
                <Notice title={t.couldNotPin(pinFailure.unpin, target.kind)}
                        body={pinFailure.message} primary={t.close} onPrimary={() => setPinFailure(null)}/>
            </NoticeOverlay>}
            {dialog === 'rename' && <Dialog title={t.renameTitle(target.kind)}
                                            body={error ?? undefined}
                                            confirm={pending ? t.saving : t.save} cancel={t.cancel} busy={pending}
                                            confirmDisabled={pending || normalizeTitle(draft) === null}
                                            onConfirm={() => void submitRename()} onCancel={closeDialog}
                                            width={320}>
                <TextField label={t.title} value={draft} maxLength={TITLE_LIMIT} autoFocus
                           onChange={(event) => setDraft(event.target.value)}
                           onKeyDown={(event) => {
                               if (event.key === 'Enter') void submitRename()
                           }}/>
            </Dialog>}
            {dialog === 'delete' && target.kind === 'note' && subNotes.status === 'ready' && subNotes.count > 0
                && <Dialog danger title={t.deleteTitle(shownTitle)} width={340}
                           body={error ?? t.deleteNoteBody(shownTitle, subNotes.count)}
                           confirm={pending ? t.deleting : t.delete} cancel={t.cancel} busy={pending}
                           confirmDisabled={pending}
                           onConfirm={() => void submitDelete()} onCancel={closeDialog}>
                    <OptionList label={t.subNotes} marker="dot" disabled={pending}
                                selected={FATES.findIndex((item) => item.fate === fate)}
                                options={FATES.map((item) => ({label: t[item.label], note: t[item.note]}))}
                                onPick={(index) => setFate(FATES[index]!.fate)}/>
                </Dialog>}
            {dialog === 'delete' && !(target.kind === 'note' && subNotes.status === 'ready' && subNotes.count > 0)
                && <Dialog danger title={t.deleteTitle(shownTitle)}
                                            body={error ?? (target.kind === 'chat' ? t.deleteChatBody(target.noteCount) : undefined)}
                                            confirm={pending ? t.deleting : t.delete} cancel={t.cancel}
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
