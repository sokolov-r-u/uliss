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

/** What a failed request means to the user; technical details stay in the console. */
export function userMessage(status: number | undefined, kind: 'http' | 'transport' | 'protocol' = 'http'): string {
    if (kind === 'transport') return 'The service is unreachable. Check the connection and try again.'
    if (kind === 'protocol') return 'The service answered unexpectedly. Try again in a moment.'
    if (status === 404) return 'This is no longer here — it may have been deleted.'
    if (status === 409) return 'It changed in the meantime. Reload and try again.'
    if (status === 429) return 'Too many requests at once. Wait a moment and try again.'
    if (status !== undefined && status >= 500) return 'Something went wrong on our side. Try again in a moment.'
    return 'The request could not be completed. Try again.'
}

/** The user's wording of any failed service call (chat, notes, constellations); never the technical message. */
export function describeError(error: unknown): string {
    if (error instanceof Error && 'kind' in error) {
        const {kind, status} = error as Error & { kind?: unknown; status?: unknown }
        const failure = kind === 'transport' || kind === 'protocol' ? kind : 'http'
        return userMessage(typeof status === 'number' ? status : undefined, failure)
    }
    return userMessage(undefined)
}
