/**
 * Drives the streaming reply endpoint (`POST /note/chats/{id}/messages/stream`). Native
 * `EventSource` can't send the Bearer header, so this goes through `authFetch` + `response.body`
 * fed into the generic `parseSseStream` (see lib/sse.ts). `AuthRequiredError`/`AbortError` (from
 * `opts.signal`) propagate to the caller unchanged — this module only interprets the SSE protocol.
 */
import {authFetch} from '../auth/apiClient'
import {parseSseStream} from '../lib/sse'

export type StreamOutcome = 'done' | 'error' | 'pending'

export class ChatStreamHttpError extends Error {
    constructor(public readonly status: number) {
        super(`chat stream request failed (${status})`)
        this.name = 'ChatStreamHttpError'
    }
}

export async function streamAssistantReply(
    chatId: string,
    content: string,
    idempotencyKey: string,
    opts: { onAppendText: (text: string) => void; onTurnId: (turnId: string) => void; signal?: AbortSignal },
): Promise<StreamOutcome> {
    const res = await authFetch(`/note/chats/${chatId}/messages/stream`, {
        method: 'POST',
        // `Accept: text/event-stream` — the handler's `produces` is SSE-only, and `authFetch`
        // otherwise defaults to `application/json`, which Spring's content negotiation 406s on.
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({content}),
        signal: opts.signal,
    })
    if (!res.ok) throw new ChatStreamHttpError(res.status)
    const turnId = res.headers.get('Chat-Turn-Id')
    if (!turnId) throw new Error('chat stream response is missing Chat-Turn-Id')
    opts.onTurnId(turnId)
    if (opts.signal?.aborted) {
        await res.body?.cancel()
        throw new DOMException('The operation was aborted.', 'AbortError')
    }
    if (!res.body) return 'error'

    for await (const evt of parseSseStream(res.body, opts.signal)) {
        if (evt.event === 'append') opts.onAppendText(evt.data)
        else if (evt.event === 'done') return 'done'
        else if (evt.event === 'error') return 'error'
        else if (evt.event === 'pending') return 'pending'
    }
    // Connection dropped without an explicit done/error terminal event.
    return 'error'
}

export async function cancelChatTurn(chatId: string, turnId: string, signal?: AbortSignal): Promise<void> {
    const res = await authFetch(`/note/chats/${chatId}/turns/${turnId}/cancel`, {method: 'POST', signal})
    if (!res.ok) throw new ChatStreamHttpError(res.status)
}
