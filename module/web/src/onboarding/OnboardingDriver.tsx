/**
 * Drives the onboarding wizard. On mount (already authenticated) it pulls the pending messages
 * and walks them one card at a time over a blocking backdrop, until the queue is exhausted —
 * then it renders nothing and the app behind (Home) is usable. Mount once in the authed area.
 *
 * Services refuse every request with `403 ONBOARDING_REQUIRED` while a blocking step is pending (the access token
 * carries the claim), so a failed load blocks with a retry instead of letting the user in, the session is refreshed
 * once the last blocking step is done, and such a refusal starts the onboarding again.
 */
import {type ComponentType, useEffect, useRef, useState} from 'react'
import {Notice} from '@uliss/design-system'
import {AuthRequiredError, onOnboardingRequired, refreshSession} from '../auth/apiClient'
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

/** A failed refresh is not fatal: the next refused request starts the onboarding again and refreshes once more. */
function refreshQuietly(): Promise<void> {
    return refreshSession().catch(() => undefined)
}

type State =
    | { status: 'idle' }
    | { status: 'error' }
    | { status: 'active'; messages: OnboardingMessage[]; index: number }
    | { status: 'done' }

export function OnboardingDriver() {
    const [state, setState] = useState<State>({status: 'idle'})
    const [attempt, setAttempt] = useState(0)
    // a service refused the user: if nothing blocking is pending any more, the access token is stale
    const refused = useRef(false)

    useEffect(() => onOnboardingRequired(() => {
        refused.current = true
        setAttempt((n) => n + 1)
    }), [])

    useEffect(() => {
        // Every run fetches and a cleaned-up run ignores its answer. A "fetched once" guard combined with this flag
        // dropped the only answer under StrictMode's double effect run in development (the GET is idempotent).
        let active = true
        fetchPending()
            .then(async (pending) => {
                if (!active) return
                const messages = pending.filter(isKnownStep)
                if (refused.current && !pending.some((message) => message.blocking)) await refreshQuietly()
                refused.current = false
                if (active) setState(messages.length ? {status: 'active', messages, index: 0} : {status: 'done'})
            })
            .catch((error: unknown) => {
                // authFetch already handles auth redirects; any other failure keeps the app blocked.
                if (active && !(error instanceof AuthRequiredError)) setState({status: 'error'})
            })
        return () => {
            active = false
        }
    }, [attempt])

    if (state.status === 'error') {
        return (
            <NoticeOverlay blocking>
                <Notice
                    blocking
                    title="Could not load your setup"
                    body="Uliss needs a few details before you start. Check the connection and try again."
                    primary="Try again"
                    onPrimary={() => setAttempt((n) => n + 1)}
                />
            </NoticeOverlay>
        )
    }

    if (state.status !== 'active') return null

    const message = state.messages[state.index]
    const progress = {current: state.index + 1, total: state.messages.length}
    const lastBlocking = message.blocking && !state.messages.slice(state.index + 1).some((next) => next.blocking)
    const advance = async () => {
        if (lastBlocking) await refreshQuietly()
        setState((s) =>
            s.status === 'active' && s.index + 1 < s.messages.length
                ? {...s, index: s.index + 1}
                : {status: 'done'},
        )
    }

    // key remounts the step (and its local form state) when the message changes.
    const Step = STEPS[message.code]
    const step = <Step key={message.code} progress={progress} blocking={message.blocking} onDone={advance}/>

    return <NoticeOverlay blocking>{step}</NoticeOverlay>
}
