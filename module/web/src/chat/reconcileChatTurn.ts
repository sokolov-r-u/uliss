import {AuthRequiredError} from '../auth/apiClient'
import type {ChatMessage} from './chatApi'

export interface ReconciliationTarget {
    turnId?: string
    afterMessageId?: string
    userContent: string
    userMessageId?: string
}

export class ReconciliationTimeoutError extends Error {
    constructor() {
        super('The saved reply could not be confirmed yet.')
        this.name = 'ReconciliationTimeoutError'
    }
}

function abortError(): DOMException {
    return new DOMException('The operation was aborted.', 'AbortError')
}

function suffixStart(history: ChatMessage[], afterMessageId?: string): number {
    if (!afterMessageId) return 0
    const index = history.findIndex((message) => message.id === afterMessageId)
    return index === -1 ? history.length : index + 1
}

export function findPersistedReply(
    history: ChatMessage[],
    target: ReconciliationTarget,
): ChatMessage | undefined {
    if (target.turnId) {
        return history.find((message) => message.turnId === target.turnId && message.role === 'ASSISTANT'
            && ['COMPLETE', 'PARTIAL', 'FAILED', 'CANCELED'].includes(message.status))
    }
    // Only historical persisted rows may be reconciled without a turn identity.
    if (!target.userMessageId) return undefined
    const start = suffixStart(history, target.afterMessageId)
    const userIndex = history.findIndex((message, index) =>
        index >= start
        && message.role === 'USER'
        && message.id === target.userMessageId && !message.turnId,
    )
    if (userIndex === -1) return undefined

    for (let index = userIndex + 1; index < history.length; index += 1) {
        const message = history[index]
        if (message.role === 'USER') return undefined
        if (message.role === 'ASSISTANT'
            && !message.turnId
            && (message.status === 'COMPLETE' || message.status === 'PARTIAL'
                || message.status === 'FAILED' || message.status === 'CANCELED')) {
            return message
        }
    }
    return undefined
}

export function targetForTrailingUser(history: ChatMessage[]): ReconciliationTarget | undefined {
    const last = history.at(-1)
    if (!last || last.role !== 'USER') return undefined
    return {
        turnId: last.turnId,
        afterMessageId: history.at(-2)?.id,
        userContent: last.content,
        userMessageId: last.id,
    }
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, delayMs)
        const onAbort = () => {
            window.clearTimeout(timeout)
            signal?.removeEventListener('abort', onAbort)
            reject(abortError())
        }
        signal?.addEventListener('abort', onAbort, {once: true})
    })
}

const DELAYS_MS = [250, 500, 1_000]

export async function reconcileUntilTerminal(
    loadHistory: (signal: AbortSignal) => Promise<ChatMessage[]>,
    target: ReconciliationTarget,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ChatMessage[]> {
    const timeoutMs = options.timeoutMs ?? 15_000
    const startedAt = Date.now()
    const controller = new AbortController()
    if (options.signal?.aborted) throw abortError()
    let timedOut = false
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort, {once: true})
    const deadline = window.setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeoutMs)
    let attempt = 0

    try {
        while (true) {
            if (controller.signal.aborted) {
                if (timedOut) throw new ReconciliationTimeoutError()
                throw abortError()
            }
            try {
                const history = await loadHistory(controller.signal)
                if (findPersistedReply(history, target)) return history
            } catch (error) {
                if (timedOut) throw new ReconciliationTimeoutError()
                if (error instanceof AuthRequiredError || options.signal?.aborted) throw error
            }

            const elapsed = Date.now() - startedAt
            if (elapsed >= timeoutMs) throw new ReconciliationTimeoutError()
            const requestedDelay = DELAYS_MS[attempt] ?? 2_000
            const delay = Math.min(requestedDelay, timeoutMs - elapsed)
            attempt += 1
            try {
                await wait(delay, controller.signal)
            } catch (error) {
                if (timedOut) throw new ReconciliationTimeoutError()
                throw error
            }
        }
    } finally {
        window.clearTimeout(deadline)
        options.signal?.removeEventListener('abort', onAbort)
    }
}
