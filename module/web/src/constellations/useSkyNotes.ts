import {useCallback, useEffect, useState} from 'react'
import type {ConstellationPickerNoteItem} from '@uliss/design-system'
import {AuthRequiredError} from '../auth/apiClient'
import {getSky} from './constellationApi'
import {pickerNotes} from './constellationTree'

export type SkyNotes =
    | { status: 'loading' }
    | { status: 'error'; retry: () => void }
    | { status: 'ready'; items: ConstellationPickerNoteItem[] }

/** Every note as the place-picker lists it, read from the sky once [enabled]; null while not needed. */
export function useSkyNotes(enabled: boolean): SkyNotes | null {
    const [state, setState] = useState<SkyNotes | null>(null)
    const [attempt, setAttempt] = useState(0)
    const retry = useCallback(() => setAttempt((value) => value + 1), [])

    useEffect(() => {
        if (!enabled) {
            setState(null)
            return
        }
        const controller = new AbortController()
        setState({status: 'loading'})
        getSky(controller.signal)
            .then((sky) => setState({status: 'ready', items: pickerNotes(sky.notes)}))
            .catch((error) => {
                if (error instanceof AuthRequiredError || controller.signal.aborted) return
                setState({status: 'error', retry})
            })
        return () => controller.abort()
    }, [enabled, attempt, retry])

    return state
}
