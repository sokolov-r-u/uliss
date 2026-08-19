/**
 * Generic SSE (Server-Sent Events) stream parser. Consumes a `ReadableStream<Uint8Array>` (as
 * returned by `fetch`'s `response.body` — used instead of the native `EventSource`, which cannot
 * send an `Authorization` header) and yields one `SseEvent` per blank-line-delimited record as it
 * arrives. Protocol-only: has no knowledge of any particular event names, so any feature streaming
 * SSE over `authFetch` can reuse it.
 */
export type SseEvent = { event: string; data: string }

function parseRecord(record: string): SseEvent {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of record.split('\n')) {
        if (line === '' || line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        let value = colon === -1 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        if (field === 'event') event = value
        else if (field === 'data') dataLines.push(value)
    }
    return {event, data: dataLines.join('\n')}
}

export async function* parseSseStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
    const reader = body.getReader()
    // Belt-and-braces alongside the AbortSignal already passed to `fetch` itself — releases the
    // underlying connection promptly even if the caller only cancels after `getReader()` was called.
    const onAbort = () => {
        void reader.cancel()
    }
    signal?.addEventListener('abort', onAbort)

    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const {done, value} = await reader.read()
            if (done) break
            buffer += decoder.decode(value, {stream: true}).replace(/\r\n/g, '\n')
            let sep: number
            while ((sep = buffer.indexOf('\n\n')) !== -1) {
                const record = buffer.slice(0, sep)
                buffer = buffer.slice(sep + 2)
                if (record.trim() !== '') yield parseRecord(record)
            }
        }
        // Flush any trailing partial multi-byte sequence, then process a final unterminated record.
        buffer += decoder.decode().replace(/\r\n/g, '\n')
        if (buffer.trim() !== '') yield parseRecord(buffer)
    } finally {
        signal?.removeEventListener('abort', onAbort)
    }
}
