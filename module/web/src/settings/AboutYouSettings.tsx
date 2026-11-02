import {useEffect, useState} from 'react'
import {Button} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {getProfile, type UserProfile} from './profileApi'
import {AuthRequiredError} from '../auth/apiClient'
import {MarkdownContent} from '../ui/MarkdownContent'
import {formatFullDate} from '../ui/format'
import {describeError} from '../lib/apiHelpers'

type State = { status: 'loading' } | { status: 'ready'; profile: UserProfile } | { status: 'error'; message: string }

/**
 * About you — the profile the chat model gets with every reply, compiled each night from the user's notes. Read-only:
 * the user shapes it through their notes.
 */
export function AboutYouSettings() {
    const [state, setState] = useState<State>({status: 'loading'})
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        setState({status: 'loading'})
        getProfile(controller.signal)
            .then((profile) => setState({status: 'ready', profile}))
            .catch((error: unknown) => {
                // an expired session is already on its way to sign-in
                if (error instanceof AuthRequiredError || controller.signal.aborted) return
                setState({status: 'error', message: describeError(error)})
            })
        return () => controller.abort()
    }, [attempt])

    return (
        <SettingsShell kicker="About you" wide>
            <p className="settings-para">
                What Uliss knows about you from your notes. The assistant reads it before every reply. It is
                updated each night with your new and changed notes.
            </p>
            <SectionLabel>Profile</SectionLabel>
            {state.status === 'loading' && <p className="settings-para">Loading…</p>}
            {state.status === 'error' && (
                <>
                    <p className="settings-para" role="alert">{state.message}</p>
                    <Button variant="quiet" size="lg" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                </>
            )}
            {state.status === 'ready' && <ProfileBody profile={state.profile}/>}
        </SettingsShell>
    )
}

function ProfileBody({profile}: { profile: UserProfile }) {
    if (profile.content === null) {
        return (
            <p className="settings-para">
                Nothing yet. Your profile appears after the first nightly update once you have notes.
            </p>
        )
    }
    const updated = formatFullDate(profile.updatedAt ?? undefined)
    return (
        <>
            <MarkdownContent content={profile.content}/>
            {updated && <p className="settings-para settings-profile-date">Updated {updated}</p>}
        </>
    )
}
