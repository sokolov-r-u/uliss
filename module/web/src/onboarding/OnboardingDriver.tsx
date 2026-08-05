/**
 * Drives the onboarding wizard. On mount (already authenticated) it pulls the pending messages
 * and walks them one card at a time over a blocking backdrop, until the queue is exhausted —
 * then it renders nothing and the app behind (Home) is usable. Mount once in the authed area.
 */
import {useEffect, useRef, useState} from 'react'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {fetchPending, type OnboardingMessage} from './onboardingApi'
import {DisplayNameStep, ProfileStep} from './steps'

type State =
    | { status: 'idle' }
    | { status: 'active'; messages: OnboardingMessage[]; index: number }
    | { status: 'done' }

export function OnboardingDriver() {
    const [state, setState] = useState<State>({status: 'idle'})
    const loaded = useRef(false)

    useEffect(() => {
        // Guard against StrictMode's double-invoke; the fetch only needs to run once per mount.
        if (loaded.current) return
        loaded.current = true

        let active = true
        fetchPending()
            .then((messages) => {
                if (!active) return
                setState(messages.length ? {status: 'active', messages, index: 0} : {status: 'done'})
            })
            .catch(() => {
                // authFetch already handles auth redirects; on any other failure just don't block Home.
                if (active) setState({status: 'done'})
            })
        return () => {
            active = false
        }
    }, [])

    if (state.status !== 'active') return null

    const message = state.messages[state.index]
    const progress = {current: state.index + 1, total: state.messages.length}
    const advance = () =>
        setState((s) =>
            s.status === 'active' && s.index + 1 < s.messages.length
                ? {...s, index: s.index + 1}
                : {status: 'done'},
        )

    // key remounts the step (and its local form state) when the message changes.
    const step =
        message.code === 'SET_DISPLAY_NAME' ? (
            <DisplayNameStep key={message.code} progress={progress} blocking={message.blocking} onDone={advance}/>
        ) : (
            <ProfileStep key={message.code} progress={progress} blocking={message.blocking} onDone={advance}/>
        )

    return <NoticeOverlay blocking>{step}</NoticeOverlay>
}
