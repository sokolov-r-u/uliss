/** Longest chat or note title, in code points; mirrors the services' `TitleNormalizer`. */
export const TITLE_LIMIT = 50

/** Mirrors the server rule: trimmed, whitespace runs collapsed, 1–50 code points. */
export function normalizeTitle(raw: string): string | null {
    const title = raw.trim().replace(/\s+/g, ' ')
    const length = Array.from(title).length
    return length > 0 && length <= TITLE_LIMIT ? title : null
}
