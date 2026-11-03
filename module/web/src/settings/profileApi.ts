import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {errorCode, isRecord} from '../lib/apiHelpers'
import {isAbortError, NoteApiError} from '../notes/noteApi'

/** Rebuilds of the profile: one may be running, a few are allowed per 30 days, the next one's date once none are. */
export interface ProfileRebuild {
    running: boolean
    remaining: number
    availableAt: string | null
}

/**
 * What the model knows about the user: the profile (both texts null until the first nightly refresh writes it), the
 * user's own description and rules, and whether the profile is being brought in line with the rules or that failed.
 */
export interface UserProfile {
    content: string | null
    updatedAt: string | null
    rebuild: ProfileRebuild
    about: string | null
    rules: string[]
    applyingRules: boolean
    rulesFailed: boolean
}

/** Most the description may hold, and how many rules of what length; the service refuses more with 400. */
export const ABOUT_MAX_CHARS = 2000
export const RULES_MAX_COUNT = 20
export const RULE_MAX_CHARS = 300

/** The caller's profile and rebuild state; fails with a `NoteApiError` like the other note-service calls. */
export async function getProfile(signal?: AbortSignal): Promise<UserProfile> {
    const response = await call('/note/profile', {signal})
    if (!response.ok) throw new NoteApiError('http', `profile failed (${response.status})`, response.status)
    return parseProfile(await response.json().catch(() => null))
}

/** Saves the user's description of themselves, trimmed; blank clears it. The profile is not rewritten for it. */
export async function saveAbout(about: string): Promise<UserProfile> {
    const text = about.trim()
    return put('/note/profile/about', {about: text === '' ? null : text})
}

/** Saves the user's rules for the profile, trimmed, in order; changed rules are applied to the profile at once. */
export async function saveRules(rules: string[]): Promise<UserProfile> {
    return put('/note/profile/rules', {rules: rules.map((rule) => rule.trim())})
}

async function put(path: string, body: unknown): Promise<UserProfile> {
    const response = await call(path, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        throw new NoteApiError('http', `saving failed (${response.status})`, response.status, undefined,
            await errorCode(response))
    }
    return parseProfile(await response.json().catch(() => null))
}

function parseProfile(body: unknown): UserProfile {
    const rebuild = isRecord(body) ? parseRebuild(body.rebuild) : null
    if (!isRecord(body) || rebuild === null) throw new NoteApiError('protocol', 'invalid profile response')
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null)
    return {
        content: text(body.content),
        updatedAt: text(body.updatedAt),
        rebuild,
        about: text(body.about),
        rules: Array.isArray(body.rules) ? body.rules.filter((rule): rule is string => typeof rule === 'string') : [],
        applyingRules: body.applyingRules === true,
        rulesFailed: body.rulesFailed === true,
    }
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
