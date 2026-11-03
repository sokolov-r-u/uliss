import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {errorCode, isRecord} from '../lib/apiHelpers'
import {isAbortError, NoteApiError} from '../notes/noteApi'

/** Rebuilds of the profile: one may be running, a few are allowed per 30 days, the next one's date once none are. */
export interface ProfileRebuild {
    running: boolean
    remaining: number
    availableAt: string | null
}

/** What the model knows about the user; both texts are null until the first nightly refresh writes it. */
export interface UserProfile {
    content: string | null
    updatedAt: string | null
    rebuild: ProfileRebuild
}

/** The caller's profile and rebuild state; fails with a `NoteApiError` like the other note-service calls. */
export async function getProfile(signal?: AbortSignal): Promise<UserProfile> {
    const response = await call('/note/profile', {signal})
    if (!response.ok) throw new NoteApiError('http', `profile failed (${response.status})`, response.status)
    const body: unknown = await response.json().catch(() => null)
    const rebuild = isRecord(body) ? parseRebuild(body.rebuild) : null
    if (!isRecord(body) || rebuild === null) throw new NoteApiError('protocol', 'invalid profile response')
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null)
    return {content: text(body.content), updatedAt: text(body.updatedAt), rebuild}
}

/**
 * Starts a rebuild of the profile from all notes. A refusal is a `NoteApiError` with the service's code:
 * `PROFILE_REBUILD_RUNNING`, `PROFILE_NOTHING_TO_REBUILD` (409) or `PROFILE_REBUILD_LIMIT` (429).
 */
export async function rebuildProfile(): Promise<ProfileRebuild> {
    const response = await call('/note/profile/rebuild', {method: 'POST'})
    if (!response.ok) {
        throw new NoteApiError(
            'http', `profile rebuild failed (${response.status})`, response.status, undefined, await errorCode(response),
        )
    }
    const rebuild = parseRebuild(await response.json().catch(() => null))
    if (rebuild === null) throw new NoteApiError('protocol', 'invalid profile rebuild response')
    return rebuild
}

async function call(path: string, init: RequestInit): Promise<Response> {
    try {
        return await authFetch(path, init)
    } catch (error) {
        if (error instanceof AuthRequiredError || isAbortError(error)) throw error
        throw new NoteApiError('transport', 'note service is unavailable', undefined, {cause: error})
    }
}

function parseRebuild(value: unknown): ProfileRebuild | null {
    if (!isRecord(value) || typeof value.running !== 'boolean' || typeof value.remaining !== 'number') return null
    return {
        running: value.running,
        remaining: value.remaining,
        availableAt: typeof value.availableAt === 'string' ? value.availableAt : null,
    }
}
