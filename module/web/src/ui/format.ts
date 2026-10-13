/** Shared display formats. Dates are always absolute (the DS lists never show relative time). */

/** A valid `Date` for an ISO string, else null. */
export function parseDate(iso?: string): Date | null {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date
}

function format(iso: string | undefined, options: Intl.DateTimeFormatOptions): string {
    return parseDate(iso)?.toLocaleDateString(undefined, options) ?? ''
}

/** 'Jun 22' — list rows. */
export const formatShortDate = (iso?: string) => format(iso, {month: 'short', day: 'numeric'})

/** 'Jun 22, 2026' — the details panel. */
export const formatFullDate = (iso?: string) => format(iso, {month: 'short', day: 'numeric', year: 'numeric'})

/** 'June 2026' — month headings of wide lists. */
export const formatMonth = (iso?: string) => format(iso, {month: 'long', year: 'numeric'})

/** 'No notes yet' · '1 note' · '3 notes'. */
export function noteCountLabel(count: number): string {
    if (count <= 0) return 'No notes yet'
    return count === 1 ? '1 note' : `${count} notes`
}
