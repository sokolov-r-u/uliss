import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {LEASE_MS, LEASE_POLL_MS, LEASE_SETTLE_MS, underRefreshLease} from './refreshLease'

const LEASE_KEY = 'uliss.token-refresh-lease'

function holdLease(owner: string, until = Date.now() + LEASE_MS) {
    localStorage.setItem(LEASE_KEY, JSON.stringify({owner, until}))
}

function deferred() {
    let resolve: () => void = () => undefined
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return {promise, resolve}
}

describe('underRefreshLease', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.useFakeTimers({toFake: ['setTimeout']})
    })
    afterEach(() => vi.useRealTimers())

    it('runs the task once its claim has settled and frees the lease afterwards', async () => {
        const task = vi.fn(async () => 'done')

        const result = underRefreshLease(task, 'tab-a')
        expect(task).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)

        await expect(result).resolves.toBe('done')
        expect(localStorage.getItem(LEASE_KEY)).toBeNull()
    })

    it("waits while another tab holds the lease and runs once it is released", async () => {
        holdLease('tab-b')
        const task = vi.fn(async () => undefined)

        const result = underRefreshLease(task, 'tab-a')
        await vi.advanceTimersByTimeAsync(LEASE_POLL_MS * 4)
        expect(task).not.toHaveBeenCalled()

        localStorage.removeItem(LEASE_KEY)
        await vi.advanceTimersByTimeAsync(LEASE_POLL_MS + LEASE_SETTLE_MS)

        await result
        expect(task).toHaveBeenCalledOnce()
    })

    it('takes over a lease whose tab is gone', async () => {
        holdLease('tab-b', Date.now() - 1)
        const task = vi.fn(async () => undefined)

        const result = underRefreshLease(task, 'tab-a')
        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)

        await result
        expect(task).toHaveBeenCalledOnce()
    })

    it("gives way when another tab's claim replaced its own before it settled", async () => {
        const task = vi.fn(async () => undefined)

        const result = underRefreshLease(task, 'tab-a')
        holdLease('tab-b')
        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS + LEASE_POLL_MS * 4)
        expect(task).not.toHaveBeenCalled()
        expect(JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null').owner).toBe('tab-b')

        localStorage.removeItem(LEASE_KEY)
        await vi.advanceTimersByTimeAsync(LEASE_POLL_MS + LEASE_SETTLE_MS)

        await result
        expect(task).toHaveBeenCalledOnce()
    })

    it('lets the second tab run only after the first one finished', async () => {
        const first = deferred()
        const events: string[] = []
        const a = underRefreshLease(async () => {
            events.push('a starts')
            await first.promise
            events.push('a ends')
        }, 'tab-a')
        const b = underRefreshLease(async () => {
            events.push('b starts')
        }, 'tab-b')

        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS + LEASE_POLL_MS * 4)
        expect(events).toEqual(['a starts'])

        first.resolve()
        await vi.advanceTimersByTimeAsync(LEASE_POLL_MS + LEASE_SETTLE_MS)
        await Promise.all([a, b])

        expect(events).toEqual(['a starts', 'a ends', 'b starts'])
    })

    it('frees the lease when the task fails', async () => {
        const result = expect(underRefreshLease(async () => {
            throw new Error('refresh failed')
        }, 'tab-a')).rejects.toThrow('refresh failed')
        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)
        await result

        expect(localStorage.getItem(LEASE_KEY)).toBeNull()
    })

    it("leaves another tab's lease in place when its own task ends", async () => {
        const result = underRefreshLease(async () => holdLease('tab-b'), 'tab-a')
        await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)
        await result

        expect(JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null').owner).toBe('tab-b')
    })
})
