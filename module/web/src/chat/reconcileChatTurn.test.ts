import {afterEach, describe, expect, it, vi} from 'vitest'
import type {ChatMessage} from './chatApi'
import {
    findPersistedReply,
    reconcileUntilTerminal,
    ReconciliationTimeoutError,
    targetForTrailingUser,
} from './reconcileChatTurn'

const user = (id: string, content: string): ChatMessage => ({id, content, role: 'USER', status: 'COMPLETE'})
const assistant = (id: string, status: ChatMessage['status'] = 'COMPLETE'): ChatMessage => ({
    id, content: status === 'FAILED' ? '' : 'reply', role: 'ASSISTANT', status,
})

describe('chat turn reconciliation', () => {
    afterEach(() => vi.useRealTimers())

    it('does not match an assistant before the persisted boundary', () => {
        const history = [user('u-old', 'same'), assistant('a-old'), user('u-new', 'same')]
        expect(findPersistedReply(history, {afterMessageId: 'a-old', userContent: 'same'})).toBeUndefined()
        expect(findPersistedReply([...history, assistant('a-new', 'PARTIAL')], {
            afterMessageId: 'a-old', userContent: 'same',
        })?.id).toBe('a-new')
    })

    it('builds a stable target for a trailing persisted user', () => {
        expect(targetForTrailingUser([assistant('a-old'), user('u-new', 'question')])).toEqual({
            afterMessageId: 'a-old', userContent: 'question', userMessageId: 'u-new',
        })
        expect(targetForTrailingUser([user('u', 'question'), assistant('a')])).toBeUndefined()
    })

    it('retries until PARTIAL becomes visible', async () => {
        vi.useFakeTimers()
        const load = vi.fn()
            .mockResolvedValueOnce([user('u', 'question')])
            .mockResolvedValueOnce([user('u', 'question'), assistant('a', 'PARTIAL')])
        const result = reconcileUntilTerminal(load, {userContent: 'question'})
        await vi.advanceTimersByTimeAsync(250)
        await expect(result).resolves.toHaveLength(2)
    })

    it('stops after the configured deadline', async () => {
        vi.useFakeTimers()
        const result = reconcileUntilTerminal(
            async () => [user('u', 'question')],
            {userContent: 'question'},
            {timeoutMs: 15_000},
        )
        const assertion = expect(result).rejects.toBeInstanceOf(ReconciliationTimeoutError)
        await vi.advanceTimersByTimeAsync(15_000)
        await assertion
    })

    it('aborts a hanging history request at the deadline', async () => {
        vi.useFakeTimers()
        const load = vi.fn((signal: AbortSignal) => new Promise<ChatMessage[]>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {once: true})
        }))
        const result = reconcileUntilTerminal(load, {userContent: 'question'}, {timeoutMs: 15_000})
        const assertion = expect(result).rejects.toBeInstanceOf(ReconciliationTimeoutError)
        await vi.advanceTimersByTimeAsync(15_000)
        await assertion
        expect(load).toHaveBeenCalledOnce()
    })

    it('aborts polling on navigation', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const result = reconcileUntilTerminal(async () => [user('u', 'question')], {userContent: 'question'}, {
            signal: controller.signal,
        })
        controller.abort()
        await expect(result).rejects.toMatchObject({name: 'AbortError'})
    })
})
