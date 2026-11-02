import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {isRecord} from '../lib/apiHelpers'
import {isAbortError, NoteApiError} from '../notes/noteApi'

/** What the model knows about the user; both fields are null until the first nightly refresh writes it. */
export interface UserProfile {
    content: string | null
    updatedAt: string | null
}

/** The caller's profile, read-only; fails with a `NoteApiError` like the other note-service calls. */
export async function getProfile(signal?: AbortSignal): Promise<UserProfile> {
    let response: Response
    try {
        response = await authFetch('/note/profile', {signal})
    } catch (error) {
        if (error instanceof AuthRequiredError || isAbortError(error)) throw error
        throw new NoteApiError('transport', 'note service is unavailable', undefined, {cause: error})
    }
    if (!response.ok) throw new NoteApiError('http', `profile failed (${response.status})`, response.status)
    const body: unknown = await response.json().catch(() => null)
    if (!isRecord(body)) throw new NoteApiError('protocol', 'invalid profile response')
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null)
    return {content: text(body.content), updatedAt: text(body.updatedAt)}
}
