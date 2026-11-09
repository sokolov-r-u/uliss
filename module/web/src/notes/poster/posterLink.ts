/** The service's limit on a poster link (`PosterUrlNormalizer.MAX_CHARS`). */
export const POSTER_LINK_MAX = 2048

/** The shorter side a poster needs to stay sharp in the panel. */
export const POSTER_MIN_SIDE = 300

export type PosterLinkCheck =
    | { kind: 'empty' }
    | { kind: 'not-https' }
    | { kind: 'credentials' }
    | { kind: 'too-long' }
    /** [href] is what is saved: the browser's form, with a non-ASCII path encoded and an IDN host in punycode. */
    | { kind: 'ok'; href: string }

/** The service's rules on a typed poster link, checked before the browser is asked to load it. */
export function checkPosterLink(raw: string): PosterLinkCheck {
    const typed = raw.trim()
    if (!typed) return {kind: 'empty'}
    let url: URL
    try {
        url = new URL(typed)
    } catch {
        return {kind: 'not-https'}
    }
    if (url.protocol !== 'https:' || !url.hostname) return {kind: 'not-https'}
    if (url.username || url.password) return {kind: 'credentials'}
    if (url.href.length > POSTER_LINK_MAX) return {kind: 'too-long'}
    return {kind: 'ok', href: url.href}
}

/** The link's host for the "image unavailable" frame; empty when it does not parse. */
export function posterHost(link: string): string {
    try {
        return new URL(link).host
    } catch {
        return ''
    }
}
