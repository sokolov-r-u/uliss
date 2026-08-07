/**
 * Controlled form fields for the Notice mechanism. Visuals ported verbatim from the Claude
 * Design `uliss-notify.jsx` (inline styles on design-system tokens); interactivity (state,
 * open/close, selection, month navigation) added here.
 */
import {type ReactNode, useState} from 'react'
import {Kicker} from '@uliss/design-system'
import {Greek, IcCal, IcCaret, IcChevron} from './glyphs'

// ── text input (kind="input") ───────────────────────────────────
export function NoticeField({
                                label,
                                placeholder,
                                value,
                                onChange,
                                max = 24,
                                autoFocus = true,
                            }: {
    label: string
    placeholder?: string
    value: string
    onChange: (v: string) => void
    max?: number
    autoFocus?: boolean
}) {
    return (
        <div>
            <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7}}>
                <Kicker size={8.5} spacing="2px" color="var(--text-muted)">
                    {label}
                </Kicker>
                <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--text-faint)',
                    letterSpacing: '0.5px'
                }}>
          {String(value.length).padStart(2, '0')} / {max}
        </span>
            </div>
            <div
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--accent)',
                    boxShadow: 'inset 0 0 0 1px rgba(217,154,78,.14), 0 0 18px -6px rgba(217,154,78,.4)',
                }}
            >
                <input
                    className="notice-input"
                    type="text"
                    value={value}
                    maxLength={max}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </div>
    )
}

// ── shared field label row ───────────────────────────────────────
function FieldLabel({label, greek}: { label: string; greek?: ReactNode }) {
    return (
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7}}>
            <Kicker size={8.5} spacing="2px" color="var(--text-muted)">
                {label}
            </Kicker>
            {greek && <Greek size={12}>{greek}</Greek>}
        </div>
    )
}

// ── dropdown (kind="profile" — gender) ───────────────────────────
export type SelectOption<T extends string> = { value: T; label: string; greek?: string }

export function NoticeSelect<T extends string>({
                                                   label,
                                                   greek,
                                                   placeholder = 'Select…',
                                                   options,
                                                   value,
                                                   onChange,
                                               }: {
    label: string
    greek?: string
    placeholder?: string
    options: SelectOption<T>[]
    value: T | null
    onChange: (v: T) => void
}) {
    const [open, setOpen] = useState(false)
    const current = options.find((o) => o.value === value) ?? null

    return (
        <div>
            <FieldLabel label={label} greek={greek}/>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpen((o) => !o)
                    }
                }}
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 15px',
                    cursor: 'pointer',
                    background: 'var(--bg-panel)',
                    border: open ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: open ? '0 0 18px -6px rgba(217,154,78,.4)' : 'none',
                }}
            >
        <span
            style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                letterSpacing: '0.8px',
                color: current ? 'var(--cream)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
            }}
        >
          {current?.label ?? placeholder}
        </span>
                <span style={{color: open ? 'var(--accent-2)' : 'var(--text-muted)', display: 'flex'}}>
          <IcChevron up={open}/>
        </span>
            </div>
            {open && (
                <div
                    style={{
                        marginTop: 6,
                        background: 'var(--bg-deep)',
                        border: '1px solid var(--accent)',
                        boxShadow: '0 20px 40px -18px rgba(0,0,0,.8), 0 0 18px -8px rgba(217,154,78,.4)',
                        overflow: 'hidden',
                    }}
                >
                    {options.map((o, i) => {
                        const on = o.value === value
                        return (
                            <div
                                key={o.value}
                                role="option"
                                aria-selected={on}
                                onClick={() => {
                                    onChange(o.value)
                                    setOpen(false)
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    height: 44,
                                    padding: '0 15px',
                                    cursor: 'pointer',
                                    background: on ? 'var(--bg-surface)' : 'transparent',
                                    borderLeft: on ? '2px solid var(--accent)' : '2px solid transparent',
                                    borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                                }}
                            >
                <span
                    style={{
                        width: 13,
                        height: 13,
                        flex: '0 0 13px',
                        borderRadius: '50%',
                        border: on ? '4px solid var(--accent-2)' : '1px solid var(--line-strong)',
                        background: on ? 'var(--bg-deep)' : 'transparent',
                    }}
                />
                                <span
                                    style={{
                                        flex: 1,
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 12.5,
                                        letterSpacing: '0.8px',
                                        color: on ? 'var(--cream)' : 'var(--cream-dim)',
                                        fontWeight: on ? 600 : 400,
                                    }}
                                >
                  {o.label}
                </span>
                                {o.greek && <Greek size={13}>{o.greek}</Greek>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── date of birth (kind="profile") ───────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Cells for a month grid, Monday-first; leading/trailing blanks are null. */
function buildMonth(year: number, month: number): (number | null)[] {
    const startMon = (new Date(year, month, 1).getDay() + 6) % 7
    const days = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < startMon; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7) cells.push(null)
    return cells
}

/** ISO `YYYY-MM-DD` for a local calendar date (no timezone shift). */
function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Validity of the typed/picked date, judged only by format — the parent owns any business rule
 * (e.g. minimum age). `valid` carries the ISO date; age is judged by the parent against `maxDate`.
 */
export type DateFieldValue =
    | { state: 'empty' }
    | { state: 'partial' } // still typing, incomplete
    | { state: 'invalid' } // 8 digits but not a real calendar date
    | { state: 'valid'; iso: string }

/** Parse an 8-digit `DDMMYYYY` buffer into a real calendar date, or null. */
function parseDigits(digits: string): Date | null {
    if (digits.length !== 8) return null
    const dd = Number(digits.slice(0, 2))
    const mm = Number(digits.slice(2, 4))
    const yyyy = Number(digits.slice(4, 8))
    if (yyyy < 1900) return null
    const d = new Date(yyyy, mm - 1, dd)
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
    return d
}

/** Format a digit buffer as `DD/MM/YYYY` (separators only between digits). */
function formatDigits(digits: string): string {
    return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter((p) => p.length > 0).join('/')
}

/** Extract `DDMMYYYY` digits from an ISO `YYYY-MM-DD` seed. */
function isoToDigits(iso: string | null): string {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
    return m ? `${m[3]}${m[2]}${m[1]}` : ''
}

function evaluate(digits: string): DateFieldValue {
    if (digits.length === 0) return {state: 'empty'}
    if (digits.length < 8) return {state: 'partial'}
    const d = parseDigits(digits)
    return d ? {state: 'valid', iso: toIso(d)} : {state: 'invalid'}
}

function DatePicker({view, selected, maxDate, onNav, onPick}: {
    view: { year: number; month: number };
    selected: Date | null;
    maxDate: Date | null;
    onNav: (delta: number) => void;
    onPick: (day: number) => void
}) {
    const cells = buildMonth(view.year, view.month)
    const wd = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    const navBtn: React.CSSProperties = {
        width: 26,
        height: 26,
        flex: '0 0 26px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--line-strong)',
        color: 'var(--cream-dim)',
        cursor: 'pointer',
    }
    const isSel = (d: number) =>
        selected != null && selected.getFullYear() === view.year && selected.getMonth() === view.month && selected.getDate() === d
    return (
        <div
            style={{
                marginTop: 6,
                background: 'var(--bg-deep)',
                border: '1px solid var(--accent)',
                padding: '12px 12px 13px',
                boxShadow: '0 20px 40px -18px rgba(0,0,0,.8), 0 0 18px -8px rgba(217,154,78,.4)',
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
        <span style={navBtn} role="button" aria-label="Previous month" onClick={() => onNav(-1)}>
          <IcCaret dir="left"/>
        </span>
                <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: 'var(--cream)'
                }}>
          {MONTHS[view.month]} {view.year}
        </span>
                <span style={navBtn} role="button" aria-label="Next month" onClick={() => onNav(1)}>
          <IcCaret dir="right"/>
        </span>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 5}}>
                {wd.map((w) => (
                    <span key={w} style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8.5,
                        letterSpacing: '0.5px',
                        color: 'var(--text-faint)'
                    }}>
            {w}
          </span>
                ))}
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2}}>
                {cells.map((d, i) => {
                    const on = d != null && isSel(d)
                    const off = d != null && maxDate != null && new Date(view.year, view.month, d) > maxDate
                    const clickable = d != null && !off
                    return (
                        <span
                            key={i}
                            role={clickable ? 'button' : undefined}
                            aria-disabled={off || undefined}
                            onClick={clickable ? () => onPick(d!) : undefined}
                            style={{
                                height: 28,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: clickable ? 'pointer' : 'default',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                fontWeight: on ? 700 : 400,
                                color: d ? (on ? 'var(--bg-deep)' : off ? 'var(--text-faint)' : 'var(--cream-dim)') : 'transparent',
                                opacity: off ? 0.4 : 1,
                                background: on ? 'var(--accent-2)' : 'transparent',
                            }}
                        >
              {d || ''}
            </span>
                    )
                })}
            </div>
        </div>
    )
}

export function NoticeDate({
                               label,
                               greek,
                               value,
                               onChange,
                               maxDate,
                           }: {
    label: string
    greek?: string
    value: string | null
    onChange: (v: DateFieldValue) => void
    /** ISO `YYYY-MM-DD` of the latest selectable day; only constrains the calendar. */
    maxDate?: string
}) {
    const [digits, setDigits] = useState(() => isoToDigits(value))
    const [open, setOpen] = useState(false)
    const maxDateObj = maxDate ? new Date(`${maxDate}T00:00:00`) : null
    const selected = parseDigits(digits)
    // View starts on the typed month, else the max-date boundary, else a sensible default (~30y back).
    const [view, setView] = useState(() => {
        const base = selected ?? maxDateObj ?? new Date(new Date().getFullYear() - 30, 0, 1)
        return {year: base.getFullYear(), month: base.getMonth()}
    })

    const commit = (next: string) => {
        setDigits(next)
        onChange(evaluate(next))
    }
    const nav = (delta: number) => {
        setView((v) => {
            const d = new Date(v.year, v.month + delta, 1)
            return {year: d.getFullYear(), month: d.getMonth()}
        })
    }
    const pick = (day: number) => {
        const d = new Date(view.year, view.month, day)
        commit(`${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`)
        setOpen(false)
    }

    return (
        <div>
            <FieldLabel label={label} greek={greek}/>
            <div
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px 0 15px',
                    background: 'var(--bg-panel)',
                    border: open ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: open ? '0 0 18px -6px rgba(217,154,78,.4)' : 'none',
                }}
            >
                <input
                    className="notice-input"
                    type="text"
                    inputMode="numeric"
                    value={formatDigits(digits)}
                    placeholder="DD/MM/YYYY"
                    onChange={(e) => commit(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    style={{letterSpacing: '1px'}}
                />
                <span
                    role="button"
                    tabIndex={0}
                    aria-label="Open calendar"
                    onClick={() => setOpen((o) => !o)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setOpen((o) => !o)
                        }
                    }}
                    style={{
                        width: 36,
                        height: 36,
                        flex: '0 0 36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: open ? 'var(--accent-2)' : 'var(--bg-muted)',
                        color: open ? 'var(--bg-deep)' : 'var(--accent-2)',
                    }}
                >
          <IcCal/>
        </span>
            </div>
            {open && <DatePicker view={view} selected={selected} maxDate={maxDateObj} onNav={nav} onPick={pick}/>}
        </div>
    )
}
