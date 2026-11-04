import {useEffect, useRef, useState} from 'react'
import {Button, Dialog, Disclosure, type Locale, TextArea, useLocale, useMessages} from '@uliss/design-system'
import {SettingsShell} from './SettingsShell'
import {
    ABOUT_MAX_CHARS,
    getProfile,
    rebuildProfile,
    RULE_MAX_CHARS,
    RULES_MAX_COUNT,
    saveAbout,
    saveRules,
    type ProfileRebuild,
    type UserProfile,
} from './profileApi'
import {AuthRequiredError} from '../auth/apiClient'
import {MarkdownContent} from '../ui/MarkdownContent'
import {formatFullDate} from '../ui/format'
import {describeError} from '../lib/apiHelpers'
import {NoteApiError} from '../notes/noteApi'
import {commonMessages} from '../i18n/common.messages'
import {aboutYouMessages} from './AboutYouSettings.messages'

type State = { status: 'loading' } | { status: 'ready'; profile: UserProfile } | { status: 'error'; message: string }

/** How often a running rebuild or the rules being applied are checked while the screen is open. */
const REBUILD_POLL_MS = 10_000

/** How much of the description the closed section shows as its hint. */
const ABOUT_HINT_CHARS = 48

/**
 * About you — what the chat model gets with every reply: the user's own description, and the profile compiled each
 * night from their notes under the user's rules. The profile itself is read-only: the user shapes it through notes and
 * rules, and may rebuild it from all notes a few times a month.
 */
export function AboutYouSettings() {
    const locale = useLocale()
    const t = useMessages(aboutYouMessages)
    const common = useMessages(commonMessages)
    // the loader words a failure in the language of the moment without reloading on a switch
    const localeRef = useRef(locale)
    localeRef.current = locale
    const [state, setState] = useState<State>({status: 'loading'})
    const [attempt, setAttempt] = useState(0)
    const [open, setOpen] = useState({about: false, rules: false, profile: true})
    const profile = state.status === 'ready' ? state.profile : null
    const waiting = profile !== null && (profile.rebuild.running || profile.applyingRules)

    useEffect(() => {
        const controller = new AbortController()
        setState({status: 'loading'})
        getProfile(controller.signal)
            .then((profile) => setState({status: 'ready', profile}))
            .catch((error: unknown) => {
                // an expired session is already on its way to sign-in
                if (error instanceof AuthRequiredError || controller.signal.aborted) return
                setState({status: 'error', message: describeError(error, localeRef.current)})
            })
        return () => controller.abort()
    }, [attempt])

    // While a rebuild runs or the rules are applied, the old profile stays on screen; a quiet re-read shows the new one.
    useEffect(() => {
        if (!waiting) return
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
    }, [waiting])

    const show = (profile: UserProfile) => setState({status: 'ready', profile})
    const showRebuild = (rebuild: ProfileRebuild) => setState((current) =>
        current.status === 'ready' ? {status: 'ready', profile: {...current.profile, rebuild}} : current)

    // after a refusal the server's state wins, without the loading screen that would hide the refusal's message
    const reread = () => {
        getProfile()
            .then(show)
            .catch(() => {
                // the screen keeps what it shows; leaving and opening it again reads it anew
            })
    }

    return (
        <SettingsShell kicker={t.kicker} wide>
            <p className="settings-para">{t.intro}</p>
            {state.status === 'loading' && <p className="settings-para">{common.loading}</p>}
            {state.status === 'error' && (
                <>
                    <p className="settings-para" role="alert">{state.message}</p>
                    <Button variant="quiet" size="lg" onClick={() => setAttempt((n) => n + 1)}>{t.tryAgain}</Button>
                </>
            )}
            {profile !== null && (
                <div className="settings-about-sections">
                    <Disclosure first title={t.aboutMe} hint={aboutHint(profile.about, t)} open={open.about}
                                onToggle={(about) => setOpen((current) => ({...current, about}))}>
                        <AboutSection about={profile.about} onSaved={show}/>
                    </Disclosure>
                    <Disclosure title={t.profileRules} hint={rulesHint(profile.rules, t)} open={open.rules}
                                onToggle={(rules) => setOpen((current) => ({...current, rules}))}>
                        <RulesSection rules={profile.rules} onSaved={show}/>
                    </Disclosure>
                    <Disclosure title={t.profile} hint={profileHint(profile, locale)} open={open.profile}
                                onToggle={(opened) => setOpen((current) => ({...current, profile: opened}))}>
                        <p className="settings-para">{t.profileIntro}</p>
                        <RebuildSection rebuild={profile.rebuild} onStarted={showRebuild} onRefused={reread}/>
                        {profile.applyingRules && <p className="settings-para" role="status">{t.applyingRules}</p>}
                        {profile.rulesFailed && (
                            <p className="settings-para" role="status">{t.rulesFailed}</p>
                        )}
                        <ProfileBody profile={profile}/>
                    </Disclosure>
                </div>
            )}
        </SettingsShell>
    )
}

/**
 * The user's own description: read, then edited in place and saved as a whole. The chat reads it as written; the
 * profile is not rewritten for it.
 */
function AboutSection({about, onSaved}: { about: string | null; onSaved: (profile: UserProfile) => void }) {
    const locale = useLocale()
    const t = useMessages(aboutYouMessages)
    const [draft, setDraft] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    if (draft === null) {
        return (
            <>
                {about === null
                    ? <p className="settings-para">{t.aboutEmpty}</p>
                    : <p className="settings-about-text">{about}</p>}
                <div className="settings-profile-actions">
                    <Button variant="quiet" size="lg" onClick={() => setDraft(about ?? '')}>{t.edit}</Button>
                </div>
            </>
        )
    }

    const over = draft.trim().length > ABOUT_MAX_CHARS
    const unchanged = draft.trim() === (about ?? '')
    const save = () => {
        setSaving(true)
        setMessage(null)
        saveAbout(draft)
            .then((profile) => {
                onSaved(profile)
                setDraft(null)
            })
            .catch((error: unknown) => {
                if (error instanceof AuthRequiredError) return
                setMessage(describeError(error, locale))
            })
            .finally(() => setSaving(false))
    }

    return (
        <>
            <TextArea aria-label={t.aboutMe} placeholder={t.aboutPlaceholder}
                      value={draft} limit={ABOUT_MAX_CHARS} rows={5} autoFocus
                      onChange={(event) => setDraft(event.target.value)}/>
            {message && <p className="settings-para" role="alert">{message}</p>}
            <div className="settings-profile-actions">
                <Button variant="primary" size="lg" disabled={over || unchanged || saving} onClick={save}>
                    {saving ? t.saving : t.save}
                </Button>
                <Button variant="quiet" size="lg" disabled={saving} onClick={() => {
                    setDraft(null)
                    setMessage(null)
                }}>{t.cancel}</Button>
            </div>
        </>
    )
}

/**
 * The user's rules for the profile: a numbered list, then edited in place and saved as a whole list. Saved rules that
 * changed are applied to the profile at once.
 */
function RulesSection({rules, onSaved}: { rules: string[]; onSaved: (profile: UserProfile) => void }) {
    const locale = useLocale()
    const t = useMessages(aboutYouMessages)
    const [draft, setDraft] = useState<string[] | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    if (draft === null) {
        return (
            <>
                {rules.length === 0
                    ? <p className="settings-para">{t.rulesEmpty}</p>
                    : <ol className="settings-rules-list">{rules.map((rule, index) => <li key={index}>{rule}</li>)}</ol>}
                <div className="settings-profile-actions">
                    <Button variant="quiet" size="lg" onClick={() => setDraft(rules.length === 0 ? [''] : [...rules])}>
                        {t.edit}
                    </Button>
                </div>
            </>
        )
    }

    const invalid = draft.some((rule) => rule.trim() === '' || rule.trim().length > RULE_MAX_CHARS)
    const unchanged = draft.length === rules.length && draft.every((rule, index) => rule.trim() === rules[index])
    const update = (index: number, value: string) =>
        setDraft((current) => current && current.map((rule, at) => (at === index ? value : rule)))
    const save = () => {
        setSaving(true)
        setMessage(null)
        saveRules(draft)
            .then((profile) => {
                onSaved(profile)
                setDraft(null)
            })
            .catch((error: unknown) => {
                if (error instanceof AuthRequiredError) return
                setMessage(describeError(error, locale))
            })
            .finally(() => setSaving(false))
    }

    return (
        <>
            <ol className="settings-rules-edit">
                {draft.map((rule, index) => (
                    <li key={index}>
                        <TextArea aria-label={t.rule(index + 1)} value={rule} limit={RULE_MAX_CHARS} rows={2}
                                  placeholder={t.rulePlaceholder}
                                  onChange={(event) => update(index, event.target.value)}/>
                        <Button variant="ghost" size="sm" aria-label={t.removeRule(index + 1)}
                                onClick={() => setDraft((current) => current && current.filter((_, at) => at !== index))}>
                            {t.remove}
                        </Button>
                    </li>
                ))}
            </ol>
            {message && <p className="settings-para" role="alert">{message}</p>}
            <div className="settings-profile-actions">
                <Button variant="quiet" size="lg" disabled={draft.length >= RULES_MAX_COUNT || saving}
                        onClick={() => setDraft((current) => current && [...current, ''])}>
                    {t.addRule}
                </Button>
                <Button variant="primary" size="lg" disabled={invalid || unchanged || saving} onClick={save}>
                    {saving ? t.saving : t.save}
                </Button>
                <Button variant="quiet" size="lg" disabled={saving} onClick={() => {
                    setDraft(null)
                    setMessage(null)
                }}>{t.cancel}</Button>
            </div>
        </>
    )
}

function ProfileBody({profile}: { profile: UserProfile }) {
    const locale = useLocale()
    const t = useMessages(aboutYouMessages)
    if (profile.content === null) {
        return (
            <p className="settings-para">
                {t.profileEmpty}
            </p>
        )
    }
    const updated = formatFullDate(profile.updatedAt ?? undefined, locale)
    return (
        <>
            <MarkdownContent content={profile.content}/>
            {updated && <p className="settings-para settings-profile-date">{t.updatedOn(updated)}</p>}
        </>
    )
}

type AboutWords = typeof aboutYouMessages.en

function aboutHint(about: string | null, t: AboutWords): string {
    if (about === null) return t.notWritten
    const line = about.replace(/\s+/g, ' ')
    return line.length > ABOUT_HINT_CHARS ? `${line.slice(0, ABOUT_HINT_CHARS).trimEnd()}…` : line
}

function rulesHint(rules: string[], t: AboutWords): string {
    if (rules.length === 0) return t.noRules
    return t.ruleCount(rules.length)
}

function profileHint(profile: UserProfile, locale: Locale): string {
    const t = aboutYouMessages[locale]
    if (profile.rebuild.running) return t.rebuildingHint
    if (profile.applyingRules) return t.applyingHint
    const updated = formatFullDate(profile.updatedAt ?? undefined, locale)
    if (profile.content === null || !updated) return t.notBuilt
    return t.updatedOn(updated)
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
    const locale = useLocale()
    const t = useMessages(aboutYouMessages)
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
                setMessage(refusalMessage(error, locale))
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
                    {rebuild.running ? t.rebuilding : t.rebuild}
                </Button>
            </div>
            <p className="settings-para">{rebuildStatus(rebuild, locale)}</p>
            {message && <p className="settings-para" role="alert">{message}</p>}
            {confirming && (
                <Dialog title={t.rebuildTitle} width={340} busy={pending} confirmDisabled={pending}
                        body={t.rebuildBody(t.triesLeft(rebuild.remaining))}
                        confirm={t.rebuild} cancel={t.notNow} onConfirm={start}
                        onCancel={() => {
                            if (!pending) setConfirming(false)
                        }}/>
            )}
        </>
    )
}

function rebuildStatus(rebuild: ProfileRebuild, locale: Locale): string {
    const t = aboutYouMessages[locale]
    if (rebuild.running) return t.rebuildRunning
    if (rebuild.remaining > 0) return t.rebuildOffer(t.triesLeft(rebuild.remaining))
    const next = formatFullDate(rebuild.availableAt ?? undefined, locale)
    return next ? t.noRebuildsUntil(next) : t.noRebuilds
}

function refusalMessage(error: unknown, locale: Locale): string {
    const t = aboutYouMessages[locale]
    if (error instanceof NoteApiError) {
        if (error.code === 'PROFILE_REBUILD_RUNNING') return t.alreadyRunning
        if (error.code === 'PROFILE_NOTHING_TO_REBUILD') return t.nothingToRebuild
        if (error.code === 'PROFILE_REBUILD_LIMIT') return t.noRebuilds
    }
    return describeError(error, locale)
}
