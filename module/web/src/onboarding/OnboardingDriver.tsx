/**
 * Drives the onboarding wizard. On mount (already authenticated) it pulls the pending messages
 * and walks them one card at a time over a blocking backdrop, until the queue is exhausted —
 * then it renders nothing and the app behind (Home) is usable. Mount once in the authed area.
 */
import {type ComponentType, useEffect, useState} from 'react'
import {NoticeOverlay} from '../ui/notice/NoticeOverlay'
import {fetchPending, type OnboardingCode, type OnboardingMessage} from './onboardingApi'
import {DisplayNameStep, ProfileStep, type StepProps} from './steps'

const STEPS: Record<OnboardingCode, ComponentType<StepProps>> = {
    SET_DISPLAY_NAME: DisplayNameStep,
    COMPLETE_PROFILE: ProfileStep,
}

/** A code added on the server before this client knows it is skipped, not shown as some other step. */
function isKnownStep(message: OnboardingMessage): boolean {
    return Object.hasOwn(STEPS, message.code)
}

type State =
    | { status: 'idle' }
    | { status: 'active'; messages: OnboardingMessage[]; index: number }
    | { status: 'done' }

export function OnboardingDriver() {
    const [state, setState] = useState<State>({status: 'idle'})

    useEffect(() => {
        // Every run fetches and a cleaned-up run ignores its answer. A "fetched once" guard combined with this flag
        // dropped the only answer under StrictMode's double effect run in development (the GET is idempotent).
        let active = true
        fetchPending()
            .then((pending) => {
                if (!active) return
                const messages = pending.filter(isKnownStep)
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
    const Step = STEPS[message.code]
    const step = <Step key={message.code} progress={progress} blocking={message.blocking} onDone={advance}/>

    return <NoticeOverlay blocking>{step}</NoticeOverlay>
}
