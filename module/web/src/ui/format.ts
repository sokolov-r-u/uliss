import type {Locale} from '@uliss/design-system'

/**
 * Shared display formats in the interface language (not the OS locale). Dates are always absolute (the DS lists never
 * show relative time).
 */

/** A valid `Date` for an ISO string, else null. */
export function parseDate(iso?: string): Date | null {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date
}

function format(iso: string | undefined, locale: Locale, options: Intl.DateTimeFormatOptions): string {
    return parseDate(iso)?.toLocaleDateString(locale, options) ?? ''
}

/** 'Jun 22' · '22 июн.' — list rows. */
export const formatShortDate = (iso: string | undefined, locale: Locale) =>
    format(iso, locale, {month: 'short', day: 'numeric'})

/** 'Jun 22, 2026' · '22 июн. 2026 г.' — the details panel. */
export const formatFullDate = (iso: string | undefined, locale: Locale) =>
    format(iso, locale, {month: 'short', day: 'numeric', year: 'numeric'})

/** 'June 2026' · 'июнь 2026 г.' — month headings of wide lists. */
export const formatMonth = (iso: string | undefined, locale: Locale) => format(iso, locale, {month: 'long', year: 'numeric'})

