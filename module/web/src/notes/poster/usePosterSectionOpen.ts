import {useCallback, useState} from 'react'

const KEY = 'uliss.note-poster.open'

function readOpen(): boolean {
    try {
        return window.localStorage.getItem(KEY) !== 'false'
    } catch {
        return true
    }
}

/** Whether the Poster section is open: one choice per device, for every note and both panels; open by default. */
export function usePosterSectionOpen(): [boolean, (open: boolean) => void] {
    const [open, setOpenState] = useState(readOpen)
    const setOpen = useCallback((next: boolean) => {
        setOpenState(next)
        try {
            window.localStorage.setItem(KEY, String(next))
        } catch {
            // storage blocked: the choice lasts until the panel goes away
        }
    }, [])
    return [open, setOpen]
}
