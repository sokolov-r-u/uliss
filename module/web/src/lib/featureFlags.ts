/**
 * The signed-in user's feature flags from user-service (`/user/users/me/features`). A flag is off until it is loaded,
 * and every flag is off when the request fails: a hidden test feature is the safe outcome.
 */
import {useEffect, useState} from 'react'
import {authFetch} from '../auth/apiClient'
import {isRecord} from './apiHelpers'

export type FeatureFlag = 'note-resummarize'

export type FeatureFlags = Partial<Record<FeatureFlag, boolean>>

export async function fetchFeatureFlags(signal?: AbortSignal): Promise<FeatureFlags> {
    const response = await authFetch('/user/users/me/features', {signal})
    if (!response.ok) throw new Error(`feature flags fetch failed (${response.status})`)
    const body: unknown = await response.json()
    if (!isRecord(body)) throw new Error('invalid feature flags response')
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value === true)) as FeatureFlags
}

/** Whether [flag] is on for the user; loaded once per mount, so a changed flag shows after the screen reopens. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
    const [flags, setFlags] = useState<FeatureFlags>({})
    useEffect(() => {
        const controller = new AbortController()
        fetchFeatureFlags(controller.signal)
            .then((loaded) => {
                if (!controller.signal.aborted) setFlags(loaded)
            })
            .catch(() => {
                // every flag stays off
            })
        return () => controller.abort()
    }, [])
    return flags[flag] === true
}
