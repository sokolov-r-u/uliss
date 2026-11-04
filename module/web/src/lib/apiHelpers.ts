import type {Locale} from '@uliss/design-system'
import {apiErrorMessages} from './apiErrors.messages'

/**
 * Helpers shared by the service clients (chat, notes, constellations, onboarding, speech): one way to read a JSON
 * body, the service's error code, and to put an id into a path.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One path segment from an id. Ids come from the address bar (`useParams`, already decoded): `..` or `a/b` must not
 * address another endpoint with the user's token.
 */
export function segment(id: string): string {
    return encodeURIComponent(id)
}

/** The `code` of the service's error body; undefined for an empty or non-JSON body (a proxy error page). */
export async function errorCode(response: Response): Promise<string | undefined> {
    try {
        const body: unknown = await response.clone().json()
        return isRecord(body) && typeof body.code === 'string' ? body.code : undefined
    } catch {
        return undefined
    }
}

/** What a failed request means to the user, in the interface language; technical details stay in the console. */
export function userMessage(status: number | undefined, kind: 'http' | 'transport' | 'protocol' = 'http',
                            locale: Locale = 'en'): string {
    const t = apiErrorMessages[locale]
    if (kind === 'transport') return t.transport
    if (kind === 'protocol') return t.protocol
    if (status === 404) return t.notFound
    if (status === 409) return t.conflict
    if (status === 429) return t.tooMany
    if (status !== undefined && status >= 500) return t.server
    return t.other
}

/** The user's wording of any failed service call (chat, notes, constellations); never the technical message. */
export function describeError(error: unknown, locale: Locale = 'en'): string {
    if (error instanceof Error && 'kind' in error) {
        const {kind, status} = error as Error & { kind?: unknown; status?: unknown }
        const failure = kind === 'transport' || kind === 'protocol' ? kind : 'http'
        return userMessage(typeof status === 'number' ? status : undefined, failure, locale)
    }
    return userMessage(undefined, 'http', locale)
}
