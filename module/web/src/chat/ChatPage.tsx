import {useEffect, useRef, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {describeError} from '../lib/apiHelpers'
import {ActionChip, Button, Notice} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError, notifyNotesChanged, requestChatSummary} from '../notes/noteApi'
import {generateClientUuid} from '../lib/clientUuid'
import {ContextPanel, PanelFact, PanelSection, usePanelOpen} from '../ui/ContextPanel'
import {ChatNotesList} from '../ui/links/ChatNotesList'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {type SummaryPlace, SummaryPlacePicker} from '../constellations/SummaryPlacePicker'
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
} from './streamChatReply'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import {ChatPageHeader} from './ChatPageHeader'
import type {DisplayMessage} from './Bubble'
import './chat.css'
import {formatFullDate} from '../ui/format'

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

function summaryRequestTarget(throughMessageId: string | undefined, noteId: string | undefined): string {
    return `${throughMessageId ?? ''}|${noteId ?? ''}`
}

interface PendingChatRequest {
    idempotencyKey: string
    turnId?: string
    stopRequested?: boolean
    initial?: boolean
    content: string
    afterMessageId?: string
}

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
            || (value.afterMessageId !== undefined && typeof value.afterMessageId !== 'string')) {
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
    const [pagePhase, setPagePhase] = useState<PagePhase>(newChat ? 'ready' : 'loading')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>([])
    const [messages, setMessages] = useState<DisplayMessage[]>([])
    const [hasMore, setHasMore] = useState(false)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [draft, setDraft] = useState('')
    const [panelOpen, togglePanel, closePanel] = usePanelOpen()
    const [chatMeta, setChatMeta] = useState<Chat | null>(null)
    const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
    const [streamNotice, setStreamNotice] = useState<string | null>(null)
    const [summaryDialog, setSummaryDialog] = useState(false)
    /** The name typed or dictated for a new summary note; blank lets Uliss name it. */
    const [summaryName, setSummaryName] = useState('')
    const [summaryNameDictating, setSummaryNameDictating] = useState(false)
    const [summaryPending, setSummaryPending] = useState(false)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [summaryState, setSummaryState] = useState<ChatSummaryState | null>(null)
    /** Bumped when a picked constellation turned out deleted, so the place picker reloads the tree. */
    const [placeRevision, setPlaceRevision] = useState(0)
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
        setStreamNotice('The saved reply could not be confirmed. Retry before sending another message.')
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
                reconciliationTargetRef.current = {userContent: pendingRequest.content}
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
                requireReconciliation()
            }
            return () => {
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
                    }
                    if (findPersistedReply(history, pendingTarget)) {
                        clearPendingChatRequest(pendingRequest.idempotencyKey)
                    } else {
                        reconciliationTargetRef.current = pendingTarget
                        if (pendingRequest.turnId) void reconcile(pendingTarget, true, routeRevision)
                        else requireReconciliation()
                    }
                    return
                }
                const target = targetForTrailingUser(history)
                if (target) void reconcile(target, true, routeRevision)
            })
            .catch((error: unknown) => {
                if (!active || error instanceof AuthRequiredError) return
                setLoadError(describeError(error))
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
            setStreamNotice(describeError(error))
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
        const liftsExistingChat = !request.initial
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
                        request.initial = false
                        persistPendingChatRequest(request, createdChatId)
                    },
                })
                : await streamAssistantReply(resolvedChatId!, request.content, request.idempotencyKey, callbacks)
            poll = outcome !== 'done'
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
            if (error instanceof AuthRequiredError) return
            if (error instanceof ChatStreamHttpError
                && (error.status === 400 || error.status === 404 || error.status === 409)) {
                clearPendingChatRequest(request.idempotencyKey, resolvedChatId)
                if (!resolvedChatId) {
                    updateGenerationPhase('idle')
                    setStreamNotice(`The message was not accepted (${error.status}). Please try again.`)
                    return
                }
                try {
                    const page = await getMessages(resolvedChatId, {signal: controller.signal})
                    const history = page.messages
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    applyPersistedHistory(page)
                    setStreamNotice(`The message was not accepted (${error.status}). Please try again.`)
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

    function retryReconciliation() {
        const target = reconciliationTargetRef.current
        const pendingRequest = pendingChatRequestRef.current
        if (!target) return
        if (!pendingRequest || (pendingRequest.stopRequested && pendingRequest.turnId)) {
            void reconcile(target, true)
            return
        }
        const now = Date.now()
        const placeholderId = `local-reply-${now}`
        setMessages(() => {
            const saved = toDisplay(persistedMessages)
            const hasUser = pendingRequest.turnId && persistedMessages.some((message) =>
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

    /** [place] puts a new note in a constellation or under a note; an update keeps the note's place. */
    async function confirmSummary(place?: SummaryPlace) {
        if (!chatId || summaryPendingRef.current || generationPhaseRef.current !== 'idle') return
        const target = summaryState
        if (!target && (isSummaryNameTooLong(summaryName) || summaryNameDictating)) return
        const requestId = summaryRequestIdRef.current + 1
        const storageKey = summaryKeyStorageKey(chatId)
        const targetStorageKey = summaryKeyTargetStorageKey(chatId)
        // A key left by an ambiguous failure may already be applied; reuse it only for the very same request.
        const requestTarget = summaryRequestTarget(persistedMessagesRef.current.at(-1)?.id, target?.noteId)
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
            const summary = target
                ? await requestChatSummary(chatId, idempotencyKey, target.noteId)
                : await requestChatSummary(chatId, idempotencyKey, undefined,
                    place && 'constellationId' in place ? place.constellationId : undefined,
                    place && 'parentNoteId' in place ? place.parentNoteId : undefined, summaryName.trim() || undefined)
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
                noteId: summary.noteId,
                noteTitle: target?.noteTitle ?? null,
            })
            setAcceptedSummary({noteId: summary.noteId, update: target != null})
            setSummaryDialog(false)
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
                setSummaryError('That constellation no longer exists. Pick another one or skip for now.')
                setPlaceRevision((value) => value + 1)
                return
            }
            if (error instanceof NoteApiError && error.code === 'PARENT_NOTE_NOT_FOUND') {
                setSummaryError('That note no longer exists. Pick another place or skip for now.')
                setPlaceRevision((value) => value + 1)
                return
            }
            if (error instanceof NoteApiError && error.status === 409) {
                setSummaryError(target
                    ? 'The note changed or is already being updated. Try again in a moment.'
                    : 'A summary of this chat is already in progress. Try again in a moment.')
                getMessages(chatId)
                    .then((page) => {
                        if (mountedRef.current && summaryRequestIdRef.current === requestId) {
                            setSummaryState(page.summary ?? null)
                        }
                    })
                    .catch(() => undefined)
                return
            }
            setSummaryError(describeError(error))
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
            <ScreenHeader back kicker="Conversation"/>
            <p className="chat-state">Loading…</p></div>
    }

    if (pagePhase === 'error') {
        return <div className="chat-page">
            <ScreenHeader back kicker="Conversation"/>
            <p className="chat-state chat-state-error">{loadError}</p></div>
    }

    const latestPersistedId = persistedMessages.at(-1)?.id
    const showSummarize = latestPersistedId != null && latestPersistedId !== summaryState?.throughMessageId
    const canSummarize = generationPhase === 'idle' && !summaryPending
    const updateTarget = summaryState
    const summaryTitle = updateTarget
        ? (updateTarget.noteTitle ? `Update “${updateTarget.noteTitle}”?` : 'Update the note?')
        : 'Create a summary note?'

    return (
        <div className="detail-layout">
        <div className="chat-page">
            <ChatPageHeader chatId={chatId} generationActive={generationPhase !== 'idle'}
                            panelOpen={panelOpen} onTogglePanel={togglePanel}
                            onChat={setChatMeta}/>
            <MessageThread messages={messages} hasMore={hasMore} isLoadingOlder={isLoadingOlder}
                           onLoadOlder={() => void loadOlderMessages()}/>
            {acceptedSummary && <section
                className="chat-summary-notice"
                role="status"
                aria-label="Summary note">
                <div className="chat-summary-notice-header">
                    <p>{acceptedSummary.update
                        ? <><span>Uliss is updating the note</span> — update started</>
                        : <><span>Uliss is writing a note</span> — summary started</>}</p>
                    <Link to={`/notes/${acceptedSummary.noteId}`}>Open note</Link>
                </div>
                <p className="chat-summary-notice-detail">
                    {acceptedSummary.update ? 'Updating in the background' : 'Generating in the background'}
                </p>
            </section>}
            {streamNotice && <div className="chat-stream-notice">
                <span>{streamNotice}</span>{generationPhase === 'reconciliation-required'
                && <Button size="sm" variant="quiet" onClick={retryReconciliation}>Retry</Button>}</div>}
            {generationPhase === 'settling' &&
                <p className="chat-settling-notice" aria-live="polite">Saving the reply…</p>}
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
                    ? <ActionChip label="Summarize" disabled={!canSummarize}
                                  onClick={() => {
                                      setSummaryError(null)
                                      setSummaryName('')
                                      setSummaryDialog(true)
                                  }}/>
                    : undefined}/>
            {summaryDialog && <NoticeOverlay blocking={summaryPending}
                                             onBackdropClick={() => setSummaryDialog(false)}>
                {updateTarget ? <Notice
                    title={summaryTitle}
                    body={summaryError
                        ? <span className="chat-summary-error">{summaryError}</span>
                        : 'New thoughts from this chat will be added at the end with today\'s date. The existing text stays as it is.'}
                    primary={summaryPending ? 'Updating…' : 'Update note'}
                    secondary={summaryPending ? undefined : 'Cancel'}
                    busy={summaryPending}
                    primaryDisabled={summaryPending}
                    onPrimary={() => void confirmSummary()}
                    onSecondary={() => setSummaryDialog(false)}/>
                    // The picker's own action starts the summary, so the notice shows no primary button of its own.
                    : <Notice
                        title={summaryTitle}
                        width={360}
                        body={summaryError
                            ? <span className="chat-summary-error">{summaryError}</span>
                            : summaryPending
                                ? 'Starting the summary…'
                                : isSummaryNameTooLong(summaryName)
                                    ? <span className="chat-summary-error">Shorten the name to 50 characters to start the summary.</span>
                                    : 'Name the note if you like and choose where it will live. Uliss writes it in the background from the conversation saved so far.'}
                        primary=""
                        secondary={summaryPending || summaryHeld ? undefined : 'Skip for now'}
                        busy={summaryPending}
                        onSecondary={() => void confirmSummary()}>
                        <SummaryNameField value={summaryName} onChange={setSummaryName} disabled={summaryPending}
                                          onDictatingChange={setSummaryNameDictating}/>
                        <SummaryPlacePicker busy={summaryPending || summaryHeld} revision={placeRevision}
                                            onPick={(place) => void confirmSummary(place)}
                                            onClose={() => {
                                                if (!summaryPendingRef.current) setSummaryDialog(false)
                                            }}/>
                    </Notice>}
            </NoticeOverlay>}
        </div>
            {chatMeta && <ContextPanel label="This chat" open={panelOpen} onClose={closePanel}>
                <PanelSection label="Notes from this chat" count={chatMeta.noteCount}>
                    <ChatNotesList chatId={chatMeta.id} onOpen={(noteId) => navigate(`/notes/${noteId}`)}
                                   empty={<p className="context-text">Uliss writes a note when the conversation has
                                       something worth keeping. Deleting the chat keeps its notes.</p>}/>
                </PanelSection>
                <PanelSection label="Dates">
                    <PanelFact label="Started" value={formatFullDate(chatMeta.createdAt) || '—'}/>
                    <PanelFact label="Updated" value={formatFullDate(chatMeta.updatedAt ?? chatMeta.createdAt) || '—'}/>
                </PanelSection>
            </ContextPanel>}
        </div>
    )
}
