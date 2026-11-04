import {type Locale, parseLocale} from './locale'

/**
 * The cookie that carries an explicit language choice between the SPA and the auth pages (`auth.<host>` is a
 * subdomain of the SPA host, so a cookie for the SPA host reaches both). No cookie means "as in the browser".
 */
export const LOCALE_COOKIE = 'uliss_lang'

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

/** Where the SPA runs: the parts of `window.location` the cookie attributes depend on. */
export interface CookieHost {
    hostname: string
    protocol: string
}

/** The chosen locale in a `document.cookie` string; null when absent or not a supported value. */
export function readLocaleCookie(cookies: string): Locale | null {
    for (const part of cookies.split(';')) {
        const separator = part.indexOf('=')
        if (separator < 0 || part.slice(0, separator).trim() !== LOCALE_COOKIE) continue
        const locale = parseLocale(decodeURIComponent(part.slice(separator + 1).trim()))
        if (locale) return locale
    }
    return null
}

/** A host that takes no `Domain` attribute: `localhost` and IP addresses keep a host-only cookie. */
function hostOnly(hostname: string): boolean {
    return hostname === 'localhost' || /^[\d.]+$/.test(hostname) || hostname.includes(':') || !hostname.includes('.')
}

/**
 * The `document.cookie` assignment that stores `locale`, or removes the choice when `locale` is null. The cookie is
 * set for the whole host (`Domain=<hostname>`) so that its subdomains — the auth pages — read it too.
 */
export function localeCookie(locale: Locale | null, host: CookieHost): string {
    const attributes = ['Path=/', 'SameSite=Lax']
    if (!hostOnly(host.hostname)) attributes.push(`Domain=${host.hostname}`)
    if (host.protocol === 'https:') attributes.push('Secure')
    attributes.push(locale ? `Max-Age=${ONE_YEAR_SECONDS}` : 'Max-Age=0')
    return [`${LOCALE_COOKIE}=${locale ?? ''}`, ...attributes].join('; ')
}

/** Stores the choice for this browser (null clears it); a browser that refuses cookies just keeps no choice. */
export function writeLocaleCookie(locale: Locale | null): void {
    try {
        document.cookie = localeCookie(locale, window.location)
    } catch {
        // cookies disabled — the choice lives until the page reloads
    }
}
