export interface RecencyGroup<T> {
    label: string
    items: T[]
}

const LABELS = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'] as const

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function bucketOf(iso: string | undefined, now: Date): number {
    const date = iso ? new Date(iso) : null
    if (!date || Number.isNaN(date.getTime())) return 4
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
    if (days <= 0) return 0
    if (days === 1) return 1
    if (days < 7) return 2
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 3
    return 4
}

/** Side-panel grouping: Today · Yesterday · This week · This month · Earlier. Keeps the input order inside a group. */
export function groupByRecency<T>(items: T[], dateOf: (item: T) => string | undefined, now = new Date()): RecencyGroup<T>[] {
    const buckets: T[][] = LABELS.map(() => [])
    for (const item of items) buckets[bucketOf(dateOf(item), now)].push(item)
    return LABELS.map((label, index) => ({label, items: buckets[index]})).filter((group) => group.items.length > 0)
}
