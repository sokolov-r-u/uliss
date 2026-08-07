/**
 * Minimum-age rule mirrored on the client for instant feedback. The backend `@BirthDate`
 * annotation remains authoritative.
 */
export const MIN_AGE_YEARS = 16

/** ISO `YYYY-MM-DD` of the latest birth date satisfying the minimum age (today − MIN_AGE_YEARS). */
export function maxBirthDateIso(min = MIN_AGE_YEARS): string {
    const now = new Date()
    const d = new Date(now.getFullYear() - min, now.getMonth(), now.getDate())
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
