/**
 * Drives the streaming reply endpoint (`POST /note/chats/{id}/messages/stream`). Native
 * `EventSource` can't send the Bearer header, so this goes through `authFetch` + `response.body`
 * fed into the generic `parseSseStream` (see lib/sse.ts). `AuthRequiredError`/`AbortError` (from
 * `opts.signal`) propagate to the caller unchanged — this module only interprets the SSE protocol.
 */
import {authFetch} from '../auth/apiClient'
import {parseSseStream} from '../lib/sse'

export type StreamOutcome = 'done' | 'error'

export async function streamAssistantReply(
    chatId: string,
    content: string,
    opts: { onToken: (chunk: string) => void; signal?: AbortSignal },
): Promise<StreamOutcome> {
    const res = await authFetch(`/note/chats/${chatId}/messages/stream`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content}),
        signal: opts.signal,
    })
    if (!res.ok || !res.body) return 'error'

    for await (const evt of parseSseStream(res.body, opts.signal)) {
        if (evt.event === 'token') opts.onToken(evt.data)
        else if (evt.event === 'done') return 'done'
        else if (evt.event === 'error') return 'error'
    }
    // Connection dropped without an explicit done/error terminal event.
    return 'error'
}
