import {LabelRow} from '../layout/LabelRow'

// 48px field on --bg-panel. The focused/active field is the only place in the
// product that gets an accent border AND a double glow (inset hairline plus an
// outer bloom) — it is where the user is being asked for something. No error
// state and no red: a bad value is prevented by the control, not punished after.

export interface TextFieldProps {
    label?: string
    greek?: string
    placeholder?: string
    value?: string
    /** Character limit — drives the counter, which turns accent 4 short of it. */
    max?: number
    focused?: boolean
}

export function TextField({label, greek, placeholder, value = '', max = 24, focused = true}: TextFieldProps) {
    const empty = !value
    const counter = !empty && (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 10,
                letterSpacing: '0.5px',
                color: value.length > max - 4 ? 'var(--accent)' : 'var(--text-faint)',
            }}
        >
      {String(value.length).padStart(2, '0')} / {max}
    </span>
    )
    return (
        <div>
            {label && <LabelRow label={label} greek={greek} right={counter}/>}
            <div
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    background: 'var(--bg-panel)',
                    border: focused ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: focused
                        ? 'inset 0 0 0 1px var(--accent-glow-soft), 0 0 18px -6px var(--accent-glow-mid)'
                        : 'none',
                }}
            >
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 14,
                letterSpacing: '0.4px',
                color: empty ? 'var(--text-faint)' : 'var(--cream)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
            }}
        >
          {value || placeholder}
        </span>
                {focused && (
                    <span
                        style={{
                            display: 'inline-block',
                            width: 8,
                            height: 18,
                            marginLeft: 2,
                            background: 'var(--accent-2)',
                            animation: 'uNoticeCaret 1.1s steps(1) infinite',
                        }}
                    />
                )}
            </div>
        </div>
    )
}
