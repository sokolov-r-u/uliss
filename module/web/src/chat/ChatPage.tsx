import {useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {ActionChip, Button, Kicker, Notice} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {NoteApiError, requestChatSummary} from '../notes/noteApi'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {type ChatMessage, getMessages, notifyChatListChanged} from './chatApi'
import {
    findPersistedReply,
    reconcileUntilTerminal,
    type ReconciliationTarget,
    targetForTrailingUser,
} from './reconcileChatTurn'
import {cancelChatTurn, ChatStreamHttpError, streamAssistantReply} from './streamChatReply'
import {MessageThread} from './MessageThread'
import {ChatComposer} from './ChatComposer'
import type {DisplayMessage} from './Bubble'
import './chat.css'

type PagePhase = 'loading' | 'error' | 'ready'
type GenerationPhase = 'idle' | 'streaming' | 'settling' | 'reconciliation-required'

function toDisplay(messages: ChatMessage[]): DisplayMessage[] {
    return messages.map(({id, role, status, content}) => ({id, role, status, content}))
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

function summaryKeyStorageKey(chatId: string): string {
    return `uliss.chat-summary.v1:${chatId}`
}

interface PendingChatRequest {
    idempotencyKey: string
    turnId?: string
    stopRequested?: boolean
    content: string
    afterMessageId?: string
}

function chatRequestStorageKey(chatId: string): string {
    return `uliss.chat-turn.v1:${chatId}`
}

function readPendingChatRequest(chatId: string): PendingChatRequest | null {
    const serialized = sessionStorage.getItem(chatRequestStorageKey(chatId))
    if (!serialized) return null
    try {
        const value = JSON.parse(serialized) as Partial<PendingChatRequest>
        if (typeof value.idempotencyKey !== 'string' || typeof value.content !== 'string'
            || (value.turnId !== undefined && typeof value.turnId !== 'string')
            || (value.stopRequested !== undefined && typeof value.stopRequested !== 'boolean')
            || (value.afterMessageId !== undefined && typeof value.afterMessageId !== 'string')) {
            sessionStorage.removeItem(chatRequestStorageKey(chatId))
            return null
        }
        return {
            idempotencyKey: value.idempotencyKey,
            turnId: value.turnId,
            stopRequested: value.stopRequested,
            content: value.content,
            afterMessageId: value.afterMessageId,
        }
    } catch {
        sessionStorage.removeItem(chatRequestStorageKey(chatId))
        return null
    }
}

export function ChatPage() {
    const {chatId} = useParams<{ chatId: string }>()
    const [pagePhase, setPagePhase] = useState<PagePhase>('loading')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>([])
    const [messages, setMessages] = useState<DisplayMessage[]>([])
    const [draft, setDraft] = useState('')
    const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
    const [streamNotice, setStreamNotice] = useState<string | null>(null)
    const [summaryDialog, setSummaryDialog] = useState(false)
    const [summaryPending, setSummaryPending] = useState(false)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [acceptedNoteId, setAcceptedNoteId] = useState<string | null>(null)
    const streamAbortRef = useRef<AbortController | null>(null)
    const pendingChatRequestRef = useRef<PendingChatRequest | null>(null)
    const reconciliationAbortRef = useRef<AbortController | null>(null)
    const reconciliationTargetRef = useRef<ReconciliationTarget | null>(null)
    const generationPhaseRef = useRef<GenerationPhase>('idle')
    const summaryPendingRef = useRef(false)
    const summaryRequestIdRef = useRef(0)
    const summaryIdempotencyKeyRef = useRef<string | null>(null)
    const routeRevisionRef = useRef(0)
    const mountedRef = useRef(true)

    function updateGenerationPhase(phase: GenerationPhase) {
        generationPhaseRef.current = phase
        setGenerationPhase(phase)
    }

    function applyPersistedHistory(history: ChatMessage[]) {
        setPersistedMessages(history)
        setMessages(toDisplay(history))
        updateGenerationPhase('idle')
        setStreamNotice(null)
        reconciliationTargetRef.current = null
        notifyChatListChanged()
    }

    function requireReconciliation() {
        updateGenerationPhase('reconciliation-required')
        setStreamNotice('The saved reply could not be confirmed. Retry before sending another message.')
    }

    function clearPendingChatRequest(expectedKey?: string) {
        if (!chatId) return
        if (expectedKey && pendingChatRequestRef.current?.idempotencyKey !== expectedKey) return
        pendingChatRequestRef.current = null
        sessionStorage.removeItem(chatRequestStorageKey(chatId))
    }

    async function reconcile(
        target: ReconciliationTarget,
        poll: boolean,
        routeRevision = routeRevisionRef.current,
    ) {
        if (!chatId) return
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
                const saved = await getMessages(chatId, controller.signal)
                if (!mountedRef.current || routeRevisionRef.current !== routeRevision || controller.signal.aborted) return
                if (findPersistedReply(saved, target)) {
                    clearPendingChatRequest()
                    applyPersistedHistory(saved)
                    return
                }
                await cancelChatTurn(chatId, target.turnId, controller.signal)
            }
            const history = poll
                ? await reconcileUntilTerminal((signal) => getMessages(chatId, signal), target, {signal: controller.signal})
                : await getMessages(chatId, controller.signal)
            if (!poll && !findPersistedReply(history, target)) {
                if (mountedRef.current && routeRevisionRef.current === routeRevision
                    && !controller.signal.aborted) requireReconciliation()
                return
            }
            if (mountedRef.current && routeRevisionRef.current === routeRevision && !controller.signal.aborted) {
                clearPendingChatRequest()
                applyPersistedHistory(history)
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
        if (!chatId) return
        let active = true
        const routeRevision = routeRevisionRef.current + 1
        routeRevisionRef.current = routeRevision
        const loadController = new AbortController()
        streamAbortRef.current?.abort()
        reconciliationAbortRef.current?.abort()
        setPagePhase('loading')
        setLoadError(null)
        updateGenerationPhase('idle')
        setAcceptedNoteId(null)
        setSummaryDialog(false)
        setSummaryPending(false)
        summaryPendingRef.current = false
        summaryRequestIdRef.current += 1
        summaryIdempotencyKeyRef.current = sessionStorage.getItem(summaryKeyStorageKey(chatId))
        pendingChatRequestRef.current = readPendingChatRequest(chatId)
        getMessages(chatId, loadController.signal)
            .then((history) => {
                if (!active) return
                setPersistedMessages(history)
                setMessages(toDisplay(history))
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
                setLoadError(error instanceof Error ? error.message : String(error))
                setPagePhase('error')
            })
        return () => {
            active = false
            routeRevisionRef.current += 1
            loadController.abort()
            streamAbortRef.current?.abort()
            reconciliationAbortRef.current?.abort()
        }
    }, [chatId])

    async function executeChatRequest(
        request: PendingChatRequest,
        target: ReconciliationTarget,
        placeholderId: string,
    ) {
        if (!chatId) return
        updateGenerationPhase('streaming')
        setStreamNotice(null)
        setAcceptedNoteId(null)

        const controller = new AbortController()
        const routeRevision = routeRevisionRef.current
        streamAbortRef.current = controller
        let poll = false
        try {
            const outcome = await streamAssistantReply(chatId, request.content, request.idempotencyKey, {
                signal: controller.signal,
                onTurnId: (turnId) => {
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision
                        || pendingChatRequestRef.current !== request
                        || !sessionStorage.getItem(chatRequestStorageKey(chatId))) return
                    request.turnId = turnId
                    target.turnId = turnId
                    sessionStorage.setItem(chatRequestStorageKey(chatId), JSON.stringify(request))
                    if (request.stopRequested) controller.abort()
                },
                onAppendText: (text) => {
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    setMessages((previous) => previous.map((message) =>
                        message.id === placeholderId ? {...message, content: message.content + text} : message,
                    ))
                },
            })
            poll = outcome !== 'done'
        } catch (error) {
            if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
            if (error instanceof AuthRequiredError) return
            if (error instanceof ChatStreamHttpError
                && (error.status === 400 || error.status === 404 || error.status === 409)) {
                clearPendingChatRequest(request.idempotencyKey)
                try {
                    const history = await getMessages(chatId, controller.signal)
                    if (!mountedRef.current || routeRevisionRef.current !== routeRevision) return
                    applyPersistedHistory(history)
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
        if (mountedRef.current && routeRevisionRef.current === routeRevision) {
            await reconcile(target, poll, routeRevision)
        }
    }

    async function onSend() {
        const content = draft.trim()
        if (!chatId || generationPhaseRef.current !== 'idle' || content === '') return

        const request: PendingChatRequest = {
            idempotencyKey: crypto.randomUUID(),
            content,
            afterMessageId: persistedMessages.at(-1)?.id,
        }
        pendingChatRequestRef.current = request
        sessionStorage.setItem(chatRequestStorageKey(chatId), JSON.stringify(request))
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
        await executeChatRequest(request, target, placeholderId)
    }

    function stopGeneration() {
        const request = pendingChatRequestRef.current
        if (!chatId || !request) return
        request.stopRequested = true
        sessionStorage.setItem(chatRequestStorageKey(chatId), JSON.stringify(request))
        if (streamAbortRef.current) streamAbortRef.current.abort()
        else if (reconciliationTargetRef.current) void reconcile(reconciliationTargetRef.current, true)
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

    async function confirmSummary() {
        if (!chatId || summaryPendingRef.current || generationPhaseRef.current !== 'idle') return
        const requestId = summaryRequestIdRef.current + 1
        const storageKey = summaryKeyStorageKey(chatId)
        const idempotencyKey = summaryIdempotencyKeyRef.current ?? crypto.randomUUID()
        summaryRequestIdRef.current = requestId
        summaryIdempotencyKeyRef.current = idempotencyKey
        sessionStorage.setItem(storageKey, idempotencyKey)
        summaryPendingRef.current = true
        setSummaryPending(true)
        setSummaryError(null)
        try {
            const summary = await requestChatSummary(chatId, idempotencyKey)
            sessionStorage.removeItem(storageKey)
            if (summaryIdempotencyKeyRef.current === idempotencyKey) {
                summaryIdempotencyKeyRef.current = null
            }
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId) return
            setAcceptedNoteId(summary.noteId)
            setSummaryDialog(false)
        } catch (error) {
            if (error instanceof NoteApiError && error.kind === 'http'
                && (error.status === 400 || error.status === 404 || error.status === 409)) {
                sessionStorage.removeItem(storageKey)
                if (summaryIdempotencyKeyRef.current === idempotencyKey) {
                    summaryIdempotencyKeyRef.current = null
                }
            }
            if (!mountedRef.current || summaryRequestIdRef.current !== requestId
                || error instanceof AuthRequiredError || isAbortError(error)) return
            setSummaryError(error instanceof Error ? error.message : String(error))
        } finally {
            if (summaryRequestIdRef.current === requestId) {
                summaryPendingRef.current = false
                if (mountedRef.current) setSummaryPending(false)
            }
        }
    }

    if (pagePhase === 'loading') {
        return <div className="chat-page">
            <div className="chat-page-header"><Link to="/chats"
                                                    className="chat-back-link">‹ chats</Link></div>
            <p
                className="chat-state">Loading…</p></div>
    }

    if (pagePhase === 'error') {
        return <div className="chat-page">
            <div className="chat-page-header"><Link to="/chats"
                                                    className="chat-back-link">‹ chats</Link></div>
            <p
                className="chat-state chat-state-error">{loadError}</p></div>
    }

    const canSummarize = generationPhase === 'idle' && persistedMessages.length > 0 && !summaryPending

    return (
        <div className="chat-page">
            <div className="chat-page-header">
                <Link to="/chats" className="chat-back-link">‹ chats</Link>
                <Kicker size={9} spacing="3px" color="var(--text-faint)">Conversation</Kicker>
            </div>
            <MessageThread messages={messages}/>
            {acceptedNoteId && <section
                className="chat-summary-notice"
                role="status"
                aria-label="Summary note">
                <div className="chat-summary-notice-header">
                    <p><span>Uliss is writing a note</span> — summary started</p>
                    <Link to={`/notes/${acceptedNoteId}`}>Open note</Link>
                </div>
                <p className="chat-summary-notice-detail">Generating in the background</p>
            </section>}
            {streamNotice && <div className="chat-stream-notice">
                <span>{streamNotice}</span>{generationPhase === 'reconciliation-required'
                && <Button size="sm" variant="quiet" onClick={retryReconciliation}>Retry</Button>}</div>}
            {generationPhase === 'settling' &&
                <p className="chat-settling-notice" aria-live="polite">Saving the reply…</p>}
            <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={() => void onSend()}
                disabled={generationPhase !== 'idle'}
                generationActive={generationPhase === 'streaming'
                    || (generationPhase === 'settling' && !!pendingChatRequestRef.current)}
                onStop={stopGeneration}
                action={<ActionChip label="Summarize" disabled={!canSummarize}
                                    onClick={() => {
                                        setSummaryError(null)
                                        setSummaryDialog(true)
                                    }}/>}/>
            {summaryDialog && <NoticeOverlay blocking={summaryPending}
                                             onBackdropClick={() => setSummaryDialog(false)}>
                <Notice
                    title="Create a summary note?"
                    body={<>{summaryError
                        ? <span className="chat-summary-error">{summaryError}</span>
                        : 'Uliss will create a permanent note in the background from the conversation saved so far.'}</>}
                    primary={summaryPending ? 'Creating…' : 'Create summary'}
                    secondary={summaryPending ? undefined : 'Cancel'}
                    busy={summaryPending}
                    primaryDisabled={summaryPending}
                    onPrimary={() => void confirmSummary()}
                    onSecondary={() => setSummaryDialog(false)}/>
            </NoticeOverlay>}
        </div>
    )
}
