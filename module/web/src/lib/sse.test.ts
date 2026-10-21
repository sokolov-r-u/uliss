import fc from 'fast-check'
import {describe, expect, it, vi} from 'vitest'
import {parseSseStream, type SseEvent} from './sse'

/** A body that delivers [text] in the given chunk sizes (bytes), like a network read would. */
function bodyOf(text: string, cuts: number[] = []): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text)
    const chunks: Uint8Array[] = []
    let at = 0
    for (const size of cuts) {
        if (at >= bytes.length) break
        chunks.push(bytes.slice(at, at + size))
        at += size
    }
    if (at < bytes.length) chunks.push(bytes.slice(at))
    return new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk))
            controller.close()
        },
    })
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
    const events: SseEvent[] = []
    for await (const event of parseSseStream(body)) events.push(event)
    return events
}

describe('parseSseStream', () => {
    it('reads named and default events, joins multi-line data and skips heartbeat comments', async () => {
        const text = 'event: delta\ndata: one\n\n: heartbeat\n\ndata: a\ndata: b\n\nevent: done\ndata:\n\n'

        expect(await collect(bodyOf(text))).toEqual([
            {event: 'delta', data: 'one'},
            {event: 'message', data: 'a\nb'},
            {event: 'done', data: ''},
        ])
    })

    it('accepts CRLF line ends and a last record without its blank line', async () => {
        expect(await collect(bodyOf('event: x\r\ndata: 1\r\n\r\ndata: tail'))).toEqual([
            {event: 'x', data: '1'},
            {event: 'message', data: 'tail'},
        ])
    })

    it('yields the same events however the bytes are split, multi-byte characters included', async () => {
        const record = fc.record({
            event: fc.constantFrom('message', 'delta', 'done'),
            data: fc.string({unit: 'grapheme'}).filter((s) => !/[\r\n]/.test(s)).map((s) => s.trimStart()),
        })
        await fc.assert(fc.asyncProperty(fc.array(record, {maxLength: 6}), fc.array(fc.integer({min: 1, max: 7})),
            async (records, cuts) => {
                const text = records.map((r) => `event: ${r.event}\ndata: ${r.data}\n\n`).join('')
                expect(await collect(bodyOf(text, cuts))).toEqual(records)
            }))
    })

    it('cancels the response body when the consumer stops early', async () => {
        const cancel = vi.fn()
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: 1\n\ndata: 2\n\n'))
            },
            cancel,
        })

        for await (const event of parseSseStream(body)) {
            expect(event.data).toBe('1')
            break
        }
        expect(cancel).toHaveBeenCalled()
    })

    it('cancels the body when the signal aborts', async () => {
        const cancel = vi.fn()
        const controller = new AbortController()
        // a stream that never delivers: only the abort can end the read
        const body = new ReadableStream<Uint8Array>({cancel})

        const events = parseSseStream(body, controller.signal)
        const next = events.next()
        controller.abort()
        await next
        expect(cancel).toHaveBeenCalled()
    })
})
