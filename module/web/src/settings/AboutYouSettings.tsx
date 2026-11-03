import {useEffect, useState} from 'react'
import {Button, Dialog} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {getProfile, rebuildProfile, type ProfileRebuild, type UserProfile} from './profileApi'
import {AuthRequiredError} from '../auth/apiClient'
import {MarkdownContent} from '../ui/MarkdownContent'
import {formatFullDate} from '../ui/format'
import {describeError} from '../lib/apiHelpers'
import {NoteApiError} from '../notes/noteApi'

type State = { status: 'loading' } | { status: 'ready'; profile: UserProfile } | { status: 'error'; message: string }

/** How often a running rebuild is checked while the screen is open. */
const REBUILD_POLL_MS = 10_000

/**
 * About you — the profile the chat model gets with every reply, compiled each night from the user's notes. Read-only:
 * the user shapes it through their notes, and may rebuild it from all of them a few times a month.
 */
export function AboutYouSettings() {
    const [state, setState] = useState<State>({status: 'loading'})
    const [attempt, setAttempt] = useState(0)
    const running = state.status === 'ready' && state.profile.rebuild.running

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

    // While a rebuild runs, the old profile stays on screen; a quiet re-read shows the new one once it is done.
    useEffect(() => {
        if (!running) return
        const controller = new AbortController()
        const timer = window.setInterval(() => {
            getProfile(controller.signal)
                .then((profile) => setState({status: 'ready', profile}))
                .catch(() => {
                    // a failed check keeps the screen as it is; the next one tries again
                })
        }, REBUILD_POLL_MS)
        return () => {
            window.clearInterval(timer)
            controller.abort()
        }
    }, [running])

    const showRebuild = (rebuild: ProfileRebuild) => setState((current) =>
        current.status === 'ready' ? {status: 'ready', profile: {...current.profile, rebuild}} : current)

    // after a refusal the server's state wins, without the loading screen that would hide the refusal's message
    const reread = () => {
        getProfile()
            .then((profile) => setState({status: 'ready', profile}))
            .catch(() => {
                // the screen keeps what it shows; leaving and opening it again reads it anew
            })
    }

    return (
        <SettingsShell kicker="About you" wide>
            <p className="settings-para">
                What Uliss knows about you from your notes. The assistant reads it before every reply. It is
                updated each night with your new and changed notes; deleted notes leave it at the next rebuild.
            </p>
            {state.status === 'ready' && (
                <RebuildSection rebuild={state.profile.rebuild} onStarted={showRebuild} onRefused={reread}/>
            )}
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

/**
 * The rebuild button with its confirmation, above the profile so it is seen without scrolling a long one; the row
 * takes the profile's other actions too. A refusal (one already running, nothing to read, no tries left) is told
 * under the button, and the screen re-reads the profile so the state matches the server.
 */
function RebuildSection({rebuild, onStarted, onRefused}: {
    rebuild: ProfileRebuild
    onStarted: (rebuild: ProfileRebuild) => void
    onRefused: () => void
}) {
    const [confirming, setConfirming] = useState(false)
    const [pending, setPending] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const start = () => {
        setPending(true)
        setMessage(null)
        rebuildProfile()
            .then(onStarted)
            .catch((error: unknown) => {
                if (error instanceof AuthRequiredError) return
                setMessage(refusalMessage(error))
                if (error instanceof NoteApiError && (error.status === 409 || error.status === 429)) onRefused()
            })
            .finally(() => {
                setPending(false)
                setConfirming(false)
            })
    }

    return (
        <>
            <div className="settings-profile-actions">
                <Button variant="quiet" size="lg" disabled={rebuild.running || rebuild.remaining === 0 || pending}
                        onClick={() => setConfirming(true)}>
                    {rebuild.running ? 'Rebuilding…' : 'Rebuild'}
                </Button>
            </div>
            <p className="settings-para">{rebuildStatus(rebuild)}</p>
            {message && <p className="settings-para" role="alert">{message}</p>}
            {confirming && (
                <Dialog title="Rebuild your profile?" width={340} busy={pending} confirmDisabled={pending}
                        body={`Uliss rereads all your notes and writes the profile anew, so deleted notes leave it. ` +
                            `The current profile stays until the new one is ready. ${triesLeft(rebuild.remaining)}.`}
                        confirm="Rebuild" cancel="Not now" onConfirm={start}
                        onCancel={() => {
                            if (!pending) setConfirming(false)
                        }}/>
            )}
        </>
    )
}

function rebuildStatus(rebuild: ProfileRebuild): string {
    if (rebuild.running) return 'Rebuilding from all your notes. The current profile stays until it is done.'
    if (rebuild.remaining > 0) return `Rewrite the profile from all your notes. ${triesLeft(rebuild.remaining)}.`
    const next = formatFullDate(rebuild.availableAt ?? undefined)
    return next ? `No rebuilds left. The next one is available on ${next}.` : 'No rebuilds left for now.'
}

function triesLeft(remaining: number): string {
    return `${remaining} ${remaining === 1 ? 'rebuild' : 'rebuilds'} left in 30 days`
}

function refusalMessage(error: unknown): string {
    if (error instanceof NoteApiError) {
        if (error.code === 'PROFILE_REBUILD_RUNNING') return 'A rebuild is already running.'
        if (error.code === 'PROFILE_NOTHING_TO_REBUILD') return 'There are no notes to build a profile from yet.'
        if (error.code === 'PROFILE_REBUILD_LIMIT') return 'No rebuilds left for now.'
    }
    return describeError(error)
}
