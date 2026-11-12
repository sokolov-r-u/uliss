import {type ReactNode, useEffect, useRef, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {describeError} from '../lib/apiHelpers'
import {ActionChip, Button, IconPicker, noteTitleText, Notice, PlaceField, useLocale, useMessages} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError, notifyNotesChanged, requestChatSummary} from '../notes/noteApi'
import {generateClientUuid} from '../lib/clientUuid'
import {EMOJI_DATA_URL} from '../lib/emojiData'
import {ContextPanel, PanelFact, PanelSection, usePanelOpen} from '../ui/ContextPanel'
import {ChatNotesList} from '../ui/links/ChatNotesList'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {SummaryPlacePicker} from '../constellations/SummaryPlacePicker'
import {type SummaryPlace, useSummaryPlaces} from '../constellations/useSummaryPlaces'
import {isSummaryNameTooLong, SummaryNameField} from './SummaryNameField'
import {ScreenHeader} from '../ui/ScreenHeader'
import {
    type Chat,
    type ChatMessage,
    type ChatMessagePage,
    type ChatSummaryState,
    getMessages,
    notifyChatListChanged,
} from './chatApi'
import {
    findPersistedReply,
    pendingReconcileTimeoutMs,
    reconcileUntilTerminal,
    type ReconciliationTarget,
    targetForTrailingUser,
} from './reconcileChatTurn'
import {
    cancelChatTurn,
    type ChatActivity,
    ChatStreamHttpError,
    streamAssistantReply,
    streamInitialAssistantReply,
    streamRetriedReply,
} from './streamChatReply'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import {ChatPageHeader} from './ChatPageHeader'
import type {DisplayMessage} from './Bubble'
import './chat.css'
import {formatFullDate} from '../ui/format'
import {commonMessages} from '../i18n/common.messages'
import {chatPageMessages} from './ChatPage.messages'

type PagePhase = 'loading' | 'error' | 'ready'
type GenerationPhase = 'idle' | 'streaming' | 'settling' | 'reconciliation-required'
const INITIAL_CHAT_REQUEST_STORAGE_KEY = 'uliss.chat-initial-turn.v1'

function toDisplay(messages: ChatMessage[]): DisplayMessage[] {
    return messages.map(({id, role, status, content}) => ({id, role, status, content}))
}

function mergeLatestMessages(existing: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
    const latestById = new Map(latest.map((message) => [message.id, message]))
    const existingIds = new Set(existing.map((message) => message.id))
    return [
        ...existing.map((message) => latestById.get(message.id) ?? message),
        ...latest.filter((message) => !existingIds.has(message.id)),
    ]
}

function hasMessageOverlap(existing: ChatMessage[], latest: ChatMessage[]): boolean {
    const existingIds = new Set(existing.map((message) => message.id))
    return latest.some((message) => existingIds.has(message.id))
}

function prependOlderMessages(existing: ChatMessage[], older: ChatMessage[]): ChatMessage[] {
    const existingIds = new Set(existing.map((message) => message.id))
    return [...older.filter((message) => !existingIds.has(message.id)), ...existing]
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

function summaryKeyStorageKey(chatId: string): string {
    return `uliss.chat-summary.v1:${chatId}`
}

/** What a stored summary key was issued for; a key is replayed only for the same request. */
function summaryKeyTargetStorageKey(chatId: string): string {
    return `uliss.chat-summary.v1:${chatId}:target`
}

function summaryRequestTarget(
    throughMessageId: string | undefined,
    noteId: string | undefined,
    place?: SummaryPlace,
    name = '',
    icon: string | null = null,
): string {
    const placeKey = !place ? '' : 'constellationId' in place ? `c:${place.constellationId}` : `n:${place.parentNoteId}`
    return `${throughMessageId ?? ''}|${noteId ?? ''}|${placeKey}|${icon ?? ''}|${name.trim()}`
}

/**
 * The text block of the summary dialogs: description, progress and errors share it, and it is as tall as the longest
 * of them (three lines), so the dialog keeps its size when the text changes.
 */
function SummaryDialogText({error, children}: { error: string | null; children: ReactNode }) {
    return <span className={`chat-summary-text${error ? ' chat-summary-error' : ''}`}>{error ?? children}</span>
}

interface PendingChatRequest {
    idempotencyKey: string
    turnId?: string
    stopRequested?: boolean
    initial?: boolean
    content: string
    afterMessageId?: string
    /** The failed or interrupted reply this request regenerates; a retry has no key of its own. */
    retryOf?: string
}

const RETRYABLE_STATUSES: readonly ChatMessage['status'][] = ['FAILED', 'PARTIAL']

function chatRequestStorageKey(chatId: string): string {
    return `uliss.chat-turn.v1:${chatId}`
}

function readPendingChatRequestFrom(storageKey: string): PendingChatRequest | null {
    const serialized = sessionStorage.getItem(storageKey)
    if (!serialized) return null
    try {
        const value = JSON.parse(serialized) as Partial<PendingChatRequest>
        if (typeof value.idempotencyKey !== 'string' || typeof value.content !== 'string'
            || (value.turnId !== undefined && typeof value.turnId !== 'string')
            || (value.stopRequested !== undefined && typeof value.stopRequested !== 'boolean')
            || (value.initial !== undefined && typeof value.initial !== 'boolean')
            || (value.afterMessageId !== undefined && typeof value.afterMessageId !== 'string')
            || (value.retryOf !== undefined && typeof value.retryOf !== 'string')) {
            sessionStorage.removeItem(storageKey)
            return null
        }
        return {
            idempotencyKey: value.idempotencyKey,
            turnId: value.turnId,
            stopRequested: value.stopRequested,
            initial: value.initial,
            content: value.content,
            afterMessageId: value.afterMessageId,
            retryOf: value.retryOf,
        }
    } catch {
        sessionStorage.removeItem(storageKey)
        return null
    }
}

function readPendingChatRequest(chatId: string): PendingChatRequest | null {
    return readPendingChatRequestFrom(chatRequestStorageKey(chatId))
}

export function ChatPage({newChat = false}: { newChat?: boolean }) {
    const {chatId} = useParams<{ chatId: string }>()
    const navigate = useNavigate()
    const locale = useLocale()
    // the history loader words a failure in the language of the moment without reloading on a switch
    const localeRef = useRef(locale)
    localeRef.current = locale
    const t = useMessages(chatPageMessages)
    const common = useMessages(commonMessages)
    const [pagePhase, setPagePhase] = useState<PagePhase>(newChat ? 'ready' : 'loading')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>([])
    const [messages, setMessages] = useState<DisplayMessage[]>([])
    const [hasMore, setHasMore] = useState(false)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [draft, setDraft] = useState('')
    const [panelOpen, togglePanel, closePanel] = usePanelOpen()
    const [chatMeta, setChatMeta] = useState<Chat | null>(null)
    // The chat a first message created while the route is still /chats/new, so the header shows its title at once.
    const [createdChatId, setCreatedChatId] = useState<string | null>(null)
    const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
    const [streamNotice, setStreamNotice] = useState<string | null>(null)
    const [summaryDialog, setSummaryDialog] = useState(false)
    /** The step of the update dialog that saves the new messages as a separate note instead. */
    const [branching, setBranching] = useState(false)
    /** The name typed or dictated for a new summary note; blank lets Uliss name it. */
    const [summaryName, setSummaryName] = useState('')
    const [summaryNameDictating, setSummaryNameDictating] = useState(false)
    /** Where a new summary note goes; null leaves it without a constellation. */
    const [summaryPlace, setSummaryPlace] = useState<SummaryPlace | null>(null)
    /** The dialog shows its "Choose a place" step. */
    const [pickingPlace, setPickingPlace] = useState(false)
    /** The user's emoji for a new summary note; Uliss never picks one. */
    const [summaryIcon, setSummaryIcon] = useState<string | null>(null)
    const [summaryPending, setSummaryPending] = useState(false)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [summaryState, setSummaryState] = useState<ChatSummaryState | null>(null)
    /** Bumped when a picked place turned out deleted, so the place field reloads the tree. */
    const [placeRevision, setPlaceRevision] = useState(0)
    // read only while a new note is being set up; an update keeps the note's place
    const summaryPlaces = useSummaryPlaces(summaryDialog && (summaryState == null || branching), placeRevision,
        setSummaryError)
    // a place gone from a fresh tree is emptied, so the line never hides a stale choice
    const summaryPlaceGone = summaryPlace != null && summaryPlaces.load.status === 'ready'
        && summaryPlaces.pathOf(summaryPlace) == null
    useEffect(() => {
        if (summaryPlaceGone) setSummaryPlace(null)
    }, [summaryPlaceGone])
    const [acceptedSummary, setAcceptedSummary] = useState<{ noteId: string, update: boolean } | null>(null)
    const streamAbortRef = useRef<AbortController | null>(null)
    const olderAbortRef = useRef<AbortController | null>(null)
    const olderLoadingRef = useRef(false)
    const persistedMessagesRef = useRef<ChatMessage[]>([])
    const nextCursorRef = useRef<string | null>(null)
    const hasMoreRef = useRef(false)
    const loadedOlderRef = useRef(false)
    const pendingChatRequestRef = useRef<PendingChatRequest | null>(null)
    const activeChatIdRef = useRef<string | null>(chatId ?? null)
    const reconciliationAbortRef = useRef<AbortController | null>(null)
    const reconciliationTargetRef = useRef<ReconciliationTarget | null>(null)
    const generationPhaseRef = useRef<GenerationPhase>('idle')
    const summaryPendingRef = useRef(false)
    const summaryRequestIdRef = useRef(0)
    const summaryIdempotencyKeyRef = useRef<string | null>(null)
    const summaryKeyTargetRef = useRef<string | null>(null)
    const routeRevisionRef = useRef(0)
    const mountedRef = useRef(true)

    function updateGenerationPhase(phase: GenerationPhase) {
        generationPhaseRef.current = phase
        setGenerationPhase(phase)
    }

    function replacePersistedWindow(history: ChatMessage[]) {
        persistedMessagesRef.current = history
        setPersistedMessages(history)
        setMessages(toDisplay(history))
    }

    function updateOlderBoundary(cursor: string | null, more: boolean) {
        nextCursorRef.current = cursor
        hasMoreRef.current = more
        setHasMore(more)
    }

    function applyPersistedHistory(page: ChatMessagePage) {
        const current = persistedMessagesRef.current
        if (current.length > 0 && page.messages.length > 0 && !hasMessageOverlap(current, page.messages)) {
            loadedOlderRef.current = false
            replacePersistedWindow(page.messages)
        } else {
            replacePersistedWindow(mergeLatestMessages(current, page.messages))
        }
        if (!loadedOlderRef.current) updateOlderBoundary(page.nextCursor, page.hasMore)
        setSummaryState(page.summary ?? null)
        updateGenerationPhase('idle')
        setStreamNotice(null)
        reconciliationTargetRef.current = null
    }

    function requireReconciliation() {
        updateGenerationPhase('reconciliation-required')
        setStreamNotice(t.replyNotConfirmed)
    }

    function persistPendingChatRequest(request: PendingChatRequest, requestChatId = activeChatIdRef.current) {
        const storageKey = requestChatId
            ? chatRequestStorageKey(requestChatId)
            : INITIAL_CHAT_REQUEST_STORAGE_KEY
        sessionStorage.setItem(storageKey, JSON.stringify(request))
    }

    function clearPendingChatRequest(expectedKey?: string, requestChatId = activeChatIdRef.current) {
        if (expectedKey && pendingChatRequestRef.current?.idempotencyKey !== expectedKey) return
        pendingChatRequestRef.current = null
        if (!newChat || !requestChatId) {
            sessionStorage.removeItem(INITIAL_CHAT_REQUEST_STORAGE_KEY)
        }
        if (requestChatId) sessionStorage.removeItem(chatRequestStorageKey(requestChatId))
    }

    async function reconcile(
        target: ReconciliationTarget,
        poll: boolean,
        routeRevision = routeRevisionRef.current,
        requestChatId = activeChatIdRef.current,
        pollTimeoutMs?: number,
    ) {
        if (!requestChatId) return
        reconciliationAbortRef.current?.abort()
        const controller = new AbortController()
        reconciliationAbortRef.current = controller
        reconciliationTargetRef.current = target
        updateGenerationPhase('settling')
        try {
            if (!target.turnId && !target.userMessageId) {
                requireReconciliation()
                return
            }
            if (pendingChatRequestRef.current?.stopRequested && target.turnId) {
                const savedPage = await getMessages(requestChatId, {signal: controller.signal})
                const saved = savedPage.messages
                if (!mountedRef.current || routeRevisionRef.current !== routeRevision || controller.signal.aborted) return
                if (findPersistedReply(saved, target)) {
                    clearPendingChatRequest(undefined, requestChatId)
                    applyPersistedHistory(savedPage)
                    return
                }
                await cancelChatTurn(requestChatId, target.turnId, controller.signal)
            }
            let refreshedPage: ChatMessagePage | undefined
            const history = poll
                ? await reconcileUntilTerminal(async (signal) => {
                    refreshedPage = await getMessages(requestChatId, {signal})
                    return refreshedPage.messages
                }, target, {signal: controller.signal, timeoutMs: pollTimeoutMs})
                : (refreshedPage = await getMessages(requestChatId, {signal: controller.signal})).messages
            if (!poll && !findPersistedReply(history, target)) {
                if (mountedRef.current && routeRevisionRef.current === routeRevision
                    && !controller.signal.aborted) requireReconciliation()
                return
            }
            if (mountedRef.current && routeRevisionRef.current === routeRevision && !controller.signal.aborted) {
                if (!refreshedPage) {
                    requireReconciliation()
                    return
                }
                clearPendingChatRequest(undefined, requestChatId)
                applyPersistedHistory({...refreshedPage, messages: history})
            }
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                || error instanceof AuthRequiredError || isAbortError(error)) return
            requireReconciliation()
        } finally {
            if (reconciliationAbortRef.current === controller) reconciliationAbortRef.current = null
        }
    }

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    useEffect(() => {
        setCreatedChatId(null)
        if (newChat) {
            activeChatIdRef.current = null
            replacePersistedWindow([])
            setSummaryState(null)
            updateOlderBoundary(null, false)
            setPagePhase('ready')
            setLoadError(null)
            updateGenerationPhase('idle')
            setStreamNotice(null)
            const pendingRequest = readPendingChatRequestFrom(INITIAL_CHAT_REQUEST_STORAGE_KEY)
            pendingChatRequestRef.current = pendingRequest
            if (pendingRequest) {
                const target: ReconciliationTarget = {userContent: pendingRequest.content}
                reconciliationTargetRef.current = target
                const now = Date.now()
                setMessages([
                    {id: `local-user-${now}`, role: 'USER', status: 'COMPLETE', content: pendingRequest.content},
                    {
                        id: `local-reply-${now}`,
                        role: 'ASSISTANT',
                        status: 'COMPLETE',
                        content: '',
                        pending: true,
                    },
                ])
                // the same key replays the created chat and its turn, so a send cut off by a reload simply goes on
                pendingRequest.initial = true
                void executeChatRequest(pendingRequest, target, `local-reply-${now}`)
            }
            return () => {
                // Leaving the new chat (a reload never gets here): a request whose chat exists lives on under that
                // chat's key, so a later "New chat" does not send it again.
                const left = pendingChatRequestRef.current
                if (left?.initial === false && readPendingChatRequestFrom(INITIAL_CHAT_REQUEST_STORAGE_KEY)
                    ?.idempotencyKey === left.idempotencyKey) sessionStorage.removeItem(INITIAL_CHAT_REQUEST_STORAGE_KEY)
                streamAbortRef.current?.abort()
                reconciliationAbortRef.current?.abort()
                olderAbortRef.current?.abort()
            }
        }
        if (!chatId) return
        activeChatIdRef.current = chatId
        let active = true
        const routeRevision = routeRevisionRef.current + 1
        routeRevisionRef.current = routeRevision
        const loadController = new AbortController()
        streamAbortRef.current?.abort()
        reconciliationAbortRef.current?.abort()
        olderAbortRef.current?.abort()
        olderLoadingRef.current = false
        loadedOlderRef.current = false
        replacePersistedWindow([])
        updateOlderBoundary(null, false)
        setIsLoadingOlder(false)
        setPagePhase('loading')
        setLoadError(null)
        updateGenerationPhase('idle')
        setAcceptedSummary(null)
        setSummaryState(null)
        setSummaryDialog(false)
        setBranching(false)
        setSummaryPending(false)
        summaryPendingRef.current = false
        summaryRequestIdRef.current += 1
        summaryIdempotencyKeyRef.current = sessionStorage.getItem(summaryKeyStorageKey(chatId))
        summaryKeyTargetRef.current = sessionStorage.getItem(summaryKeyTargetStorageKey(chatId))
        pendingChatRequestRef.current = readPendingChatRequest(chatId)
        getMessages(chatId, {signal: loadController.signal})
            .then((page) => {
                if (!active) return
                const history = page.messages
                replacePersistedWindow(history)
                setSummaryState(page.summary ?? null)
                updateOlderBoundary(page.nextCursor, page.hasMore)
                setPagePhase('ready')
                const pendingRequest = pendingChatRequestRef.current
                if (pendingRequest) {
                    const pendingTarget: ReconciliationTarget = {
                        turnId: pendingRequest.turnId,
                        afterMessageId: pendingRequest.afterMessageId,
                        userContent: pendingRequest.content,
                        replacedMessageId: pendingRequest.retryOf,
                    }
                    if (findPersistedReply(history, pendingTarget)) {
                        clearPendingChatRequest(pendingRequest.idempotencyKey)
                    } else {
                        reconciliationTargetRef.current = pendingTarget
                        if (pendingRequest.stopRequested && pendingRequest.turnId) {
                            void reconcile(pendingTarget, true, routeRevision)
                        } else {
                            // a request cut off by a reload is repeated: the server answers with its outcome or pending
                            resumePendingRequest(pendingRequest, pendingTarget)
                        }
                    }
                    return
                }
                const target = targetForTrailingUser(history)
                if (target) void reconcile(target, true, routeRevision)
            })
            .catch((error: unknown) => {
                if (!active || error instanceof AuthRequiredError) return
                setLoadError(describeError(error, localeRef.current))
                setPagePhase('error')
            })
        return () => {
            active = false
            routeRevisionRef.current += 1
            loadController.abort()
            streamAbortRef.current?.abort()
            reconciliationAbortRef.current?.abort()
            olderAbortRef.current?.abort()
        }
    }, [chatId, newChat])

    async function loadOlderMessages() {
        const cursor = nextCursorRef.current
        if (!chatId || !cursor || !hasMoreRef.current || olderLoadingRef.current) return
        const routeRevision = routeRevisionRef.current
        const controller = new AbortController()
        olderAbortRef.current?.abort()
        olderAbortRef.current = controller
        olderLoadingRef.current = true
        setIsLoadingOlder(true)
        try {
            const page = await getMessages(chatId, {before: cursor, signal: controller.signal})
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision || controller.signal.aborted) return
            loadedOlderRef.current = true
            replacePersistedWindow(prependOlderMessages(persistedMessagesRef.current, page.messages))
            updateOlderBoundary(page.nextCursor, page.hasMore)
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                || error instanceof AuthRequiredError || isAbortError(error)) return
            setStreamNotice(describeError(error, locale))
        } finally {
            if (olderAbortRef.current === controller) {
                olderAbortRef.current = null
                olderLoadingRef.current = false
                if (mountedRef.current && routeRevisionRef.current === routeRevision) setIsLoadingOlder(false)
            }
        }
    }

    async function executeChatRequest(
        request: PendingChatRequest,
        target: ReconciliationTarget,
        placeholderId: string,
        requestChatId = activeChatIdRef.current,
    ) {
        if (!request.initial && !requestChatId) return
        updateGenerationPhase('streaming')
        setStreamNotice(null)
        setAcceptedSummary(null)

        const controller = new AbortController()
        const routeRevision = routeRevisionRef.current
        streamAbortRef.current = controller
        let resolvedChatId = requestChatId
        // The server touched the existing chat's activity on accepting this turn; a new chat is announced by onChatId.
        // A retry is not new activity.
        const liftsExistingChat = !request.initial && !request.retryOf
        let chatListsNotified = false
        let poll = false
        let pollTimeoutMs: number | undefined
        try {
            const callbacks = {
                signal: controller.signal,
                onTurnId: (turnId: string) => {
                    // Chat lists reorder by activity even if the user has already left.
                    if (liftsExistingChat && !chatListsNotified) {
                        chatListsNotified = true
                        notifyChatListChanged()
                    }
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                        || pendingChatRequestRef.current !== request) return
                    request.turnId = turnId
                    request.initial = false
                    target.turnId = turnId
                    persistPendingChatRequest(request, resolvedChatId)
                    if (request.stopRequested) controller.abort()
                },
                onPending: (retryAfterMs: number) => {
                    pollTimeoutMs = pendingReconcileTimeoutMs(retryAfterMs)
                },
                onActivity: (activity: ChatActivity) => {
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    setMessages((previous) => previous.map((message) =>
                        message.id === placeholderId ? {...message, activity} : message,
                    ))
                },
                onAppendText: (text: string) => {
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    setMessages((previous) => previous.map((message) =>
                        message.id === placeholderId ? {...message, content: message.content + text} : message,
                    ))
                },
            }
            const outcome = request.initial
                ? await streamInitialAssistantReply(request.content, request.idempotencyKey, {
                    ...callbacks,
                    onChatId: (createdChatId) => {
                        // The server created and named the chat from this first message: chat lists gain it now,
                        // once, even if the user has already left. Later turns reorder them through onTurnId.
                        notifyChatListChanged()
                        if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                            || pendingChatRequestRef.current !== request) return
                        resolvedChatId = createdChatId
                        activeChatIdRef.current = createdChatId
                        setCreatedChatId(createdChatId)
                        request.initial = false
                        persistPendingChatRequest(request, createdChatId)
                    },
                    // The title is stored before it is sent; lists and the header re-read it, wherever the user is.
                    onTitle: () => notifyChatListChanged(),
                })
                : request.retryOf && request.turnId
                ? await streamRetriedReply(resolvedChatId!, request.turnId, request.retryOf, callbacks)
                : await streamAssistantReply(resolvedChatId!, request.content, request.idempotencyKey, callbacks)
            poll = outcome !== 'done'
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
            if (error instanceof AuthRequiredError) return
            if (error instanceof ChatStreamHttpError
                && (error.status === 400 || error.status === 404 || error.status === 409)) {
                clearPendingChatRequest(request.idempotencyKey, resolvedChatId)
                const rejected = request.retryOf
                    ? t.retryRejected(error.status)
                    : t.messageRejected(error.status)
                if (!resolvedChatId) {
                    updateGenerationPhase('idle')
                    setStreamNotice(rejected)
                    return
                }
                try {
                    const page = await getMessages(resolvedChatId, {signal: controller.signal})
                    const history = page.messages
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    applyPersistedHistory(page)
                    setStreamNotice(rejected)
                    const activeTarget = targetForTrailingUser(history)
                    if (activeTarget) await reconcile(activeTarget, true, routeRevision)
                } catch (loadError) {
                    if (!(loadError instanceof AuthRequiredError) && !isAbortError(loadError)
                        && mountedRef.current && routeRevisionRef.current === routeRevision) requireReconciliation()
                }
                return
            }
            poll = true
        } finally {
            if (streamAbortRef.current === controller) streamAbortRef.current = null
        }
        // Without a turn id the server may still have accepted (and lifted) the chat; refetch the lists once.
        if (liftsExistingChat && !chatListsNotified) {
            chatListsNotified = true
            notifyChatListChanged()
        }
        if (poll && mountedRef.current && routeRevisionRef.current === routeRevision) {
            // Nothing reports activity any more; reconciliation waits on the saved reply.
            setMessages((previous) => previous.map((message) =>
                message.id === placeholderId ? {...message, activity: undefined} : message,
            ))
        }
        if (mountedRef.current && routeRevisionRef.current === routeRevision && resolvedChatId) {
            await reconcile(target, poll, routeRevision, resolvedChatId, pollTimeoutMs)
        } else if (mountedRef.current && routeRevisionRef.current === routeRevision) {
            requireReconciliation()
        }
        if (newChat && mountedRef.current && routeRevisionRef.current === routeRevision && resolvedChatId) {
            navigate(`/chats/${resolvedChatId}`, {replace: true})
            sessionStorage.removeItem(INITIAL_CHAT_REQUEST_STORAGE_KEY)
        }
    }

    async function onSend(text?: string) {
        const content = (text ?? draft).trim()
        if (generationPhaseRef.current !== 'idle' || content === '') return

        const requestChatId = activeChatIdRef.current
        const initial = requestChatId == null

        const request: PendingChatRequest = {
            idempotencyKey: generateClientUuid(),
            initial,
            content,
            afterMessageId: persistedMessagesRef.current.at(-1)?.id,
        }
        pendingChatRequestRef.current = request
        persistPendingChatRequest(request, requestChatId)
        const target: ReconciliationTarget = {
            afterMessageId: request.afterMessageId,
            userContent: content,
        }
        reconciliationTargetRef.current = target
        const now = Date.now()
        const placeholderId = `local-reply-${now}`
        setMessages((previous) => [
            ...previous,
            {id: `local-user-${now}`, role: 'USER', status: 'COMPLETE', content},
            {id: placeholderId, role: 'ASSISTANT', status: 'COMPLETE', content: '', pending: true},
        ])
        setDraft('')
        await executeChatRequest(request, target, placeholderId, requestChatId)
    }

    function stopGeneration() {
        const request = pendingChatRequestRef.current
        const requestChatId = activeChatIdRef.current
        if (!request) return
        request.stopRequested = true
        persistPendingChatRequest(request, requestChatId)
        if (streamAbortRef.current) streamAbortRef.current.abort()
        else if (requestChatId && reconciliationTargetRef.current) {
            void reconcile(reconciliationTargetRef.current, true)
        }
    }

    /** Regenerates the chat's latest reply after it failed or broke off; only the user's click starts it. */
    function retryReply() {
        const requestChatId = activeChatIdRef.current
        const persisted = persistedMessagesRef.current
        const failed = persisted.at(-1)
        if (!requestChatId || generationPhaseRef.current !== 'idle' || !failed?.turnId
            || failed.role !== 'ASSISTANT' || !RETRYABLE_STATUSES.includes(failed.status)) return
        const user = persisted.find((message) => message.role === 'USER' && message.turnId === failed.turnId)
        const request: PendingChatRequest = {
            idempotencyKey: generateClientUuid(),
            turnId: failed.turnId,
            content: user?.content ?? '',
            retryOf: failed.id,
        }
        pendingChatRequestRef.current = request
        persistPendingChatRequest(request, requestChatId)
        const target: ReconciliationTarget = {
            turnId: failed.turnId,
            userContent: request.content,
            replacedMessageId: failed.id,
        }
        reconciliationTargetRef.current = target
        // the server drops the failed reply when the retry starts; history merges never bring it back
        replacePersistedWindow(persisted.slice(0, -1))
        const placeholderId = `local-reply-${Date.now()}`
        setMessages((previous) => [
            ...previous,
            {id: placeholderId, role: 'ASSISTANT', status: 'COMPLETE', content: '', pending: true},
        ])
        void executeChatRequest(request, target, placeholderId, requestChatId)
    }

    function retryReconciliation() {
        const target = reconciliationTargetRef.current
        const pendingRequest = pendingChatRequestRef.current
        if (!target) return
        if (!pendingRequest || (pendingRequest.stopRequested && pendingRequest.turnId)) {
            void reconcile(target, true)
            return
        }
        resumePendingRequest(pendingRequest, target)
    }

    /** Sends [pendingRequest] again with its own key (or retried reply) and shows it as streaming. */
    function resumePendingRequest(pendingRequest: PendingChatRequest, target: ReconciliationTarget) {
        const now = Date.now()
        const placeholderId = `local-reply-${now}`
        const persisted = persistedMessagesRef.current.filter((message) => message.id !== pendingRequest.retryOf)
        if (pendingRequest.retryOf) replacePersistedWindow(persisted)
        setMessages(() => {
            const saved = toDisplay(persisted)
            const hasUser = pendingRequest.turnId && persisted.some((message) =>
                message.role === 'USER' && message.turnId === pendingRequest.turnId)
            const withUser = hasUser
                ? saved
                : [...saved, {
                    id: `local-user-${now}`,
                    role: 'USER' as const,
                    status: 'COMPLETE' as const,
                    content: pendingRequest.content,
                }]
            return [...withUser, {
                id: placeholderId,
                role: 'ASSISTANT' as const,
                status: 'COMPLETE' as const,
                content: '',
                pending: true,
            }]
        })
        void executeChatRequest(pendingRequest, target, placeholderId)
    }

    /**
     * [place] puts a new note in a constellation or under a note; an update keeps the note's place. With [branch] the
     * messages after the main note's boundary become a separate note and the main note stays as it is.
     */
    async function confirmSummary(place?: SummaryPlace, branch = false) {
        if (!chatId || summaryPendingRef.current || generationPhaseRef.current !== 'idle') return
        const main = summaryState
        if (branch && !main) return
        // the note an update appends to; null while a new note (the first one or a branch) is requested
        const target = branch ? null : main
        if (!target && (isSummaryNameTooLong(summaryName) || summaryNameDictating)) return
        const requestId = summaryRequestIdRef.current + 1
        const storageKey = summaryKeyStorageKey(chatId)
        const targetStorageKey = summaryKeyTargetStorageKey(chatId)
        // A key left by an ambiguous failure may already be applied; reuse it only for the very same request.
        const requestTarget = summaryRequestTarget(persistedMessagesRef.current.at(-1)?.id,
            branch ? `branch:${main?.noteId}` : target?.noteId,
            target ? undefined : place, target ? '' : summaryName, target ? null : summaryIcon)
        const storedKey = summaryKeyTargetRef.current === requestTarget ? summaryIdempotencyKeyRef.current : null
        const idempotencyKey = storedKey ?? generateClientUuid()
        summaryRequestIdRef.current = requestId
        summaryIdempotencyKeyRef.current = idempotencyKey
        summaryKeyTargetRef.current = requestTarget
        sessionStorage.setItem(storageKey, idempotencyKey)
        sessionStorage.setItem(targetStorageKey, requestTarget)
        summaryPendingRef.current = true
        setSummaryPending(true)
        setSummaryError(null)
        try {
            const constellationId = place && 'constellationId' in place ? place.constellationId : undefined
            const parentNoteId = place && 'parentNoteId' in place ? place.parentNoteId : undefined
            const name = summaryName.trim() || undefined
            const summary = target
                ? await requestChatSummary(chatId, idempotencyKey, target.noteId)
                : branch && main
                    ? await requestChatSummary(chatId, idempotencyKey, undefined, constellationId, parentNoteId, name,
                        summaryIcon, main.noteId)
                    : await requestChatSummary(chatId, idempotencyKey, undefined, constellationId, parentNoteId, name,
                        summaryIcon)
            sessionStorage.removeItem(storageKey)
            sessionStorage.removeItem(targetStorageKey)
            if (summaryIdempotencyKeyRef.current === idempotencyKey) {
                summaryIdempotencyKeyRef.current = null
            }
            // The chat gained a note even if this page has gone; chat lists show the count, note lists the note.
            notifyChatListChanged()
            notifyNotesChanged()
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId) return
            // Hide Summarize until a new message arrives; the next latest page confirms the boundary.
            setSummaryState({
                throughMessageId: persistedMessagesRef.current.at(-1)?.id ?? null,
                // a branch leaves the main note the one that the next update appends to
                noteId: main?.noteId ?? summary.noteId,
                noteTitle: main?.noteTitle ?? null,
                noteIcon: main?.noteIcon ?? null,
            })
            setAcceptedSummary({noteId: summary.noteId, update: target != null})
            setSummaryDialog(false)
            setBranching(false)
        } catch (error) {
            if (error instanceof NoteApiError && error.kind === 'http'
                && (error.status === 400 || error.status === 404 || error.status === 409)) {
                sessionStorage.removeItem(storageKey)
                sessionStorage.removeItem(targetStorageKey)
                if (summaryIdempotencyKeyRef.current === idempotencyKey) {
                    summaryIdempotencyKeyRef.current = null
                }
            }
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId
                || error instanceof AuthRequiredError || isAbortError(error)) return
            if (error instanceof NoteApiError && error.code === 'CONSTELLATION_NOT_FOUND') {
                setSummaryError(t.constellationGone)
                setSummaryPlace(null)
                setPlaceRevision((value) => value + 1)
                return
            }
            if (error instanceof NoteApiError && error.code === 'PARENT_NOTE_NOT_FOUND') {
                setSummaryError(t.parentNoteGone)
                setSummaryPlace(null)
                setPlaceRevision((value) => value + 1)
                return
            }
            if (error instanceof NoteApiError && error.status === 409) {
                setSummaryError(target
                    ? t.noteBusy
                    : t.summaryBusy)
                getMessages(chatId)
                    .then((page) => {
                        if (mountedRef.current && summaryRequestIdRef.current === requestId) {
                            setSummaryState(page.summary ?? null)
                            // without a main note the typed fields would start a summary of the whole chat
                            if (branch && !page.summary) {
                                setBranching(false)
                                setSummaryDialog(false)
                            }
                        }
                    })
                    .catch(() => undefined)
                return
            }
            setSummaryError(describeError(error, locale))
        } finally {
            if (summaryRequestIdRef.current === requestId) {
                summaryPendingRef.current = false
                if (mountedRef.current) setSummaryPending(false)
            }
        }
    }

    /** A name over the limit, or one still being dictated, keeps a new summary from starting. */
    const summaryHeld = isSummaryNameTooLong(summaryName) || summaryNameDictating

    if (pagePhase === 'loading') {
        return <div className="chat-page">
            <ScreenHeader back kicker={t.conversation}/>
            <p className="chat-state">{common.loading}</p></div>
    }

    if (pagePhase === 'error') {
        return <div className="chat-page">
            <ScreenHeader back kicker={t.conversation}/>
            <p className="chat-state chat-state-error">{loadError}</p></div>
    }

    const latestPersisted = persistedMessages.at(-1)
    const retryableId = generationPhase === 'idle' && latestPersisted?.role === 'ASSISTANT' && latestPersisted.turnId
        && RETRYABLE_STATUSES.includes(latestPersisted.status) ? latestPersisted.id : undefined
    const latestPersistedId = latestPersisted?.id
    const showSummarize = latestPersistedId != null && latestPersistedId !== summaryState?.throughMessageId
    const canSummarize = generationPhase === 'idle' && !summaryPending
    const updateTarget = summaryState
    const summaryTitle = updateTarget
        ? (updateTarget.noteTitle
            ? t.updateNamed(noteTitleText(updateTarget.noteTitle, updateTarget.noteIcon))
            : t.updateNote)
        : t.createSummary

    return (
        <div className="detail-layout">
        <div className="chat-page">
            <ChatPageHeader chatId={chatId ?? createdChatId ?? undefined} generationActive={generationPhase !== 'idle'}
                            panelOpen={panelOpen} onTogglePanel={togglePanel}
                            onChat={setChatMeta}/>
            <MessageThread messages={messages} hasMore={hasMore} isLoadingOlder={isLoadingOlder}
                           onLoadOlder={() => void loadOlderMessages()}
                           retryableId={retryableId} onRetry={retryReply}/>
            {acceptedSummary && <section
                className="chat-summary-notice"
                role="status"
                aria-label={t.summaryNote}>
                <div className="chat-summary-notice-header">
                    <p>{acceptedSummary.update
                        ? <><span>{t.updatingNote}</span>{t.updateStarted}</>
                        : <><span>{t.writingNote}</span>{t.summaryStarted}</>}</p>
                    <Link to={`/notes/${acceptedSummary.noteId}`}>{t.openNote}</Link>
                </div>
                <p className="chat-summary-notice-detail">
                    {acceptedSummary.update ? t.updatingInBackground : t.generatingInBackground}
                </p>
            </section>}
            {streamNotice && <div className="chat-stream-notice">
                <span>{streamNotice}</span>{generationPhase === 'reconciliation-required'
                && <Button size="sm" variant="quiet" onClick={retryReconciliation}>{common.retry}</Button>}</div>}
            {generationPhase === 'settling' &&
                <p className="chat-settling-notice" aria-live="polite">{t.savingReply}</p>}
            {/* keyed by chat: switching chats drops a recording instead of sending it into the next chat */}
            <ChatComposer
                key={chatId ?? 'new'}
                value={draft}
                onChange={setDraft}
                onSubmit={(text) => void onSend(text)}
                disabled={generationPhase !== 'idle'}
                generationActive={generationPhase === 'streaming'
                    || (generationPhase === 'settling' && !!pendingChatRequestRef.current)}
                onStop={stopGeneration}
                action={showSummarize
                    ? <ActionChip label={t.summarize} disabled={!canSummarize}
                                  onClick={() => {
                                      setSummaryError(null)
                                      setSummaryName('')
                                      setSummaryPlace(null)
                                      setPickingPlace(false)
                                      setSummaryIcon(null)
                                      setBranching(false)
                                      setSummaryDialog(true)
                                  }}/>
                    : undefined}/>
            {summaryDialog && <NoticeOverlay blocking={summaryPending}
                                             onBackdropClick={() => setSummaryDialog(false)}>
                {updateTarget && !branching ? <Notice
                    title={summaryTitle}
                    body={<SummaryDialogText error={summaryError}>
                        {t.updateBody}
                    </SummaryDialogText>}
                    primary={summaryPending ? t.updating : t.updateNoteAction}
                    secondary={t.cancel}
                    secondaryDisabled={summaryPending}
                    busy={summaryPending}
                    primaryDisabled={summaryPending}
                    onPrimary={() => void confirmSummary()}
                    onSecondary={() => setSummaryDialog(false)}>
                    <Button size="sm" variant="quiet" disabled={summaryPending}
                            onClick={() => {
                                setSummaryError(null)
                                // the default place: under the chat's main note
                                setSummaryPlace({parentNoteId: updateTarget.noteId})
                                setBranching(true)
                            }}>{t.saveAsNewNote}</Button>
                </Notice>
                    : <Notice
                        title={updateTarget ? t.newNoteTitle : summaryTitle}
                        width={360}
                        body={<SummaryDialogText error={summaryError}>
                            {summaryPending
                                ? t.startingSummary
                                : updateTarget ? t.newNoteBody : t.summaryBody}
                        </SummaryDialogText>}
                        primary={t.summarize}
                        primaryDisabled={summaryHeld}
                        busy={summaryPending}
                        secondary={updateTarget ? t.back : undefined}
                        secondaryDisabled={summaryPending}
                        onSecondary={updateTarget ? () => {
                            setSummaryError(null)
                            setPickingPlace(false)
                            setBranching(false)
                        } : undefined}
                        showClose
                        onClose={() => {
                            if (!summaryPendingRef.current) setSummaryDialog(false)
                        }}
                        onPrimary={() => void confirmSummary(summaryPlace ?? undefined, updateTarget != null)}
                        step={pickingPlace ? {
                            title: t.choosePlace,
                            onBack: () => setPickingPlace(false),
                            children: <SummaryPlacePicker places={summaryPlaces} busy={summaryPending}
                                                          error={summaryError}
                                                          onPick={(place) => {
                                                              setSummaryError(null)
                                                              setSummaryPlace(place)
                                                              setPickingPlace(false)
                                                          }}/>,
                        } : undefined}>
                        <SummaryNameField value={summaryName} onChange={setSummaryName} disabled={summaryPending}
                                          onDictatingChange={setSummaryNameDictating}
                                          leading={<IconPicker label={t.icon} value={summaryIcon} disabled={summaryPending}
                                                               dataSource={EMOJI_DATA_URL} onChange={setSummaryIcon}
                                                               cover/>}/>
                        <PlaceField label={t.place} placeholder={t.choosePlace} disabled={summaryPending}
                                    value={summaryPlace ? summaryPlaces.pathOf(summaryPlace) : null}
                                    open={pickingPlace} onOpen={() => setPickingPlace(true)}
                                    onClear={() => setSummaryPlace(null)}/>
                    </Notice>}
            </NoticeOverlay>}
        </div>
            {chatMeta && <ContextPanel label={t.thisChat} open={panelOpen} onClose={closePanel}>
                <PanelSection label={t.notesFromChat} count={chatMeta.noteCount}>
                    <ChatNotesList chatId={chatMeta.id} onOpen={(noteId) => navigate(`/notes/${noteId}`)}
                                   empty={<p className="context-text">{t.notesFromChatEmpty}</p>}/>
                </PanelSection>
                <PanelSection label={t.dates}>
                    <PanelFact label={t.started} value={formatFullDate(chatMeta.createdAt, locale) || '—'}/>
                    <PanelFact label={t.updated} value={formatFullDate(chatMeta.updatedAt ?? chatMeta.createdAt, locale) || '—'}/>
                </PanelSection>
            </ContextPanel>}
        </div>
    )
}
