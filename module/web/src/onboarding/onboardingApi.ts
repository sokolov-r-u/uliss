/**
 * Client for the user-service onboarding endpoints (`/user/users/me/onboarding`). Uses
 * `authFetch` so JWT + proactive/reactive refresh are handled centrally (see auth/apiClient.ts).
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

/** Body for `POST /user/users/me/onboarding`. `command` selects the step; fields are per-command. */
export type OnboardingSubmit = {
    command: OnboardingCode
    displayName?: string
    /** ISO `YYYY-MM-DD`. */
    birthDate?: string
    gender?: Gender
}

/**
 * Thrown on a refused submit so steps can show an inline message and stay open. `field` names the first field the
 * service rejected (`displayName`, `birthDate`); the step words it in the interface language. The service's own text
 * stays in `message`, for the console only.
 */
export class OnboardingSubmitError extends Error {
    constructor(message: string, readonly field?: string) {
        super(message)
        this.name = 'OnboardingSubmitError'
    }
}

export async function fetchPending(): Promise<OnboardingMessage[]> {
    const res = await authFetch('/user/users/me/onboarding')
    if (!res.ok) throw new Error(`onboarding fetch failed (${res.status})`)
    return (await res.json()) as OnboardingMessage[]
}

export async function submit(request: OnboardingSubmit): Promise<void> {
    const res = await authFetch('/user/users/me/onboarding', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(request),
    })
    // 409: the step is no longer pending (a double submit, another tab) — it is done either way
    if (res.status === 409) return
    if (!res.ok) throw await submitError(res)
}

/** The service `ErrorResponse` (`{ code, details: { field: msg } }`) as a submit error naming the rejected field. */
async function submitError(res: Response): Promise<OnboardingSubmitError> {
    const text = await res.text().catch(() => '')
    try {
        const body = JSON.parse(text) as { details?: Record<string, string>; code?: string }
        const [field, detail] = Object.entries(body.details ?? {})[0] ?? []
        return new OnboardingSubmitError(detail ?? body.code ?? `submit failed (${res.status})`, field)
    } catch {
        // not JSON (a proxy page): no field to name
        return new OnboardingSubmitError(`submit failed (${res.status})`)
    }
}
