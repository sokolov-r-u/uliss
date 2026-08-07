/**
 * Client for the user-service onboarding endpoints (`/users/me/onboarding`). Uses `authFetch`
 * so JWT + proactive/reactive refresh are handled centrally (see auth/apiClient.ts).
 */
import {authFetch} from '../auth/apiClient'

export type OnboardingCode = 'SET_DISPLAY_NAME' | 'COMPLETE_PROFILE'
export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

/** Max display-name length, matching the backend `profile.users.display_name` column (varchar(32)). */
export const DISPLAY_NAME_MAX_LENGTH = 32

/** One pending onboarding message (blocking ones come first). */
export type OnboardingMessage = {
    code: OnboardingCode
    blocking: boolean
    status: string
}

/** Body for `POST /users/me/onboarding`. `command` selects the step; fields are per-command. */
export type OnboardingSubmit = {
    command: OnboardingCode
    displayName?: string
    /** ISO `YYYY-MM-DD`. */
    birthDate?: string
    gender?: Gender
}

/** Thrown on a 4xx submit so steps can show an inline message and stay open. */
export class OnboardingSubmitError extends Error {
}

export async function fetchPending(): Promise<OnboardingMessage[]> {
    const res = await authFetch('/users/me/onboarding')
    if (!res.ok) throw new Error(`onboarding fetch failed (${res.status})`)
    return (await res.json()) as OnboardingMessage[]
}

export async function submit(request: OnboardingSubmit): Promise<void> {
    const res = await authFetch('/users/me/onboarding', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(request),
    })
    if (!res.ok) throw new OnboardingSubmitError(await errorMessage(res))
}

/** Pull a human message out of the service `ErrorResponse` (`{ details: { field: msg } }`). */
async function errorMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => '')
    try {
        const body = JSON.parse(text) as { details?: Record<string, string>; code?: string }
        const detail = body.details && Object.values(body.details)[0]
        if (detail) return detail
        if (body.code) return body.code
    } catch {
        // not JSON — fall through to the raw body / status
    }
    return text || `submit failed (${res.status})`
}
