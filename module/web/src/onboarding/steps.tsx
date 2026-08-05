/**
 * Onboarding step cards. Each owns its local form state, submits via onboardingApi, and calls
 * `onDone` to advance. Built on the controlled Notice fields (ui/notice/fields).
 */
import {useState} from 'react'
import {AuthRequiredError} from '../auth/apiClient'
import {Notice} from '../ui/notice/Notice'
import {type DateFieldValue, NoticeDate, NoticeField, NoticeSelect, type SelectOption} from '../ui/notice/fields'
import {maxBirthDateIso, MIN_AGE_YEARS} from './age'
import {type Gender, OnboardingSubmitError, submit} from './onboardingApi'

type StepProps = {
    progress: { current: number; total: number }
    blocking: boolean
    onDone: () => void
}

function ErrorLine({children}: { children: string }) {
    return (
        <div style={{
            marginTop: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.4px',
            color: 'var(--terracotta)'
        }}>{children}</div>
    )
}

/** Turns a submit call into busy/error handling shared by both steps. */
function useSubmit(onDone: () => void) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const run = async (build: () => Parameters<typeof submit>[0]) => {
        setBusy(true)
        setError(null)
        try {
            await submit(build())
            onDone()
        } catch (e) {
            if (e instanceof AuthRequiredError) return // auth flow took over
            setError(e instanceof OnboardingSubmitError ? e.message : 'Something went wrong. Try again.')
        } finally {
            setBusy(false)
        }
    }
    return {busy, error, run}
}

// ── step 1: display name (blocking) ──────────────────────────────
export function DisplayNameStep({progress, blocking, onDone}: StepProps) {
    const [name, setName] = useState('')
    const {busy, error, run} = useSubmit(onDone)
    const trimmed = name.trim()

    return (
        <Notice
            blocking={blocking}
            progress={progress}
            greek="ὄνομα · your name"
            title="What shall we call you?"
            primary="Continue"
            primaryDisabled={trimmed.length === 0}
            busy={busy}
            onPrimary={() => run(() => ({command: 'SET_DISPLAY_NAME', displayName: trimmed}))}
        >
            <NoticeField label="Display name" placeholder="e.g. Wayfarer" value={name} onChange={setName} max={24}/>
            {error && <ErrorLine>{error}</ErrorLine>}
        </Notice>
    )
}

// ── step 2: profile — gender + date of birth (optional / skippable) ──
const GENDERS: SelectOption<Gender>[] = [
    {value: 'FEMALE', label: 'Female', greek: 'ἡ'},
    {value: 'MALE', label: 'Male', greek: 'ὁ'},
    {value: 'OTHER', label: 'Other', greek: '—'},
]

export function ProfileStep({progress, blocking, onDone}: StepProps) {
    const [gender, setGender] = useState<Gender | null>(null)
    const [date, setDate] = useState<DateFieldValue>({state: 'empty'})
    const {busy, error, run} = useSubmit(onDone)
    const maxDate = maxBirthDateIso()

    const underage = date.state === 'valid' && date.iso > maxDate
    const dateError =
        date.state === 'invalid' ? 'Not a real date.' : underage ? `You must be at least ${MIN_AGE_YEARS} years old.` : null
    // Empty/partial is a valid skip; only a present-but-bad date blocks submit.
    const birthDate = date.state === 'valid' && !underage ? date.iso : undefined
    const primaryDisabled = date.state === 'invalid' || underage

    return (
        <Notice
            blocking={blocking}
            progress={progress}
            greek="βίος · about you"
            title="A little about you"
            primary="Begin"
            secondary="Skip"
            primaryDisabled={primaryDisabled}
            busy={busy}
            onSecondary={() => run(() => ({command: 'COMPLETE_PROFILE'}))}
            onPrimary={() =>
                run(() => ({
                    command: 'COMPLETE_PROFILE',
                    gender: gender ?? undefined,
                    birthDate,
                }))
            }
        >
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                <NoticeSelect label="Sex" greek="γένος" options={GENDERS} value={gender} onChange={setGender}/>
                <NoticeDate label="Date of birth" greek="γενέθλια" value={null} onChange={setDate} maxDate={maxDate}/>
            </div>
            {dateError && <ErrorLine>{dateError}</ErrorLine>}
            {error && <ErrorLine>{error}</ErrorLine>}
        </Notice>
    )
}
