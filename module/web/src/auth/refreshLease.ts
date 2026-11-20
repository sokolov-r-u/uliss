/**
 * A lock across tabs for browsers without Web Locks: a lease in localStorage. A write reaches the other tabs with a
 * delay, so a tab claims the lease, waits [LEASE_SETTLE_MS] and runs only if its claim survived; a tab that sees
 * another tab's lease waits until it is released or expires. Best effort: Web Locks are used wherever they exist.
 */
import {REFRESH_TIMEOUT_MS} from './authApi'

const LEASE_KEY = 'uliss.token-refresh-lease'

/** Longer than a refresh with its one retry, so a lease expires only when its tab is gone. */
export const LEASE_MS = 2 * REFRESH_TIMEOUT_MS + 10_000
/** How long a claim needs to reach the other tabs before it is checked. */
export const LEASE_SETTLE_MS = 50
/** How often a waiting tab looks at the lease again. */
export const LEASE_POLL_MS = 250

const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

type Lease = { owner: string; until: number }

function readLease(): Lease | null {
    try {
        return JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as Lease | null
    } catch {
        return null
    }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs [task] once no other tab holds the lease; [owner] identifies this tab. */
export async function underRefreshLease<T>(task: () => Promise<T>, owner: string = TAB_ID): Promise<T> {
    for (;;) {
        const lease = readLease()
        if (lease && lease.owner !== owner && lease.until > Date.now()) {
            await pause(LEASE_POLL_MS)
            continue
        }
        localStorage.setItem(LEASE_KEY, JSON.stringify({owner, until: Date.now() + LEASE_MS}))
        await pause(LEASE_SETTLE_MS)
        if (readLease()?.owner === owner) break
    }
    try {
        return await task()
    } finally {
        if (readLease()?.owner === owner) localStorage.removeItem(LEASE_KEY)
    }
}
