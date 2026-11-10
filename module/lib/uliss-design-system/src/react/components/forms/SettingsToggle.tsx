import type {ButtonHTMLAttributes} from 'react'

// An on/off settings row: an uppercase name, one line of what it does, and a
// square switch on the right. The whole row is the switch (role="switch").

export interface SettingsToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> {
    label: string
    /** One line of what the setting does. */
    hint?: string
    on: boolean
    onChange: (on: boolean) => void
    /** A hairline above the row. */
    divider?: boolean
}

export function SettingsToggle({label, hint, on, onChange, divider = false, type = 'button', ...buttonProps}: SettingsToggleProps) {
    return (
        <button
            {...buttonProps}
            type={type}
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            style={{
                width: '100%',
                minHeight: 44,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 0',
                border: 'none',
                borderTop: divider ? '1px solid var(--line)' : 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                ...buttonProps.style,
            }}
        >
            <span style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <span style={{
                    color: 'var(--cream-dim)',
                    fontFamily: 'var(--font-text)',
                    fontSize: 10.5,
                    letterSpacing: '1.6px',
                    textTransform: 'uppercase',
                }}>{label}</span>
                {hint && <small style={{
                    color: 'var(--text-faint)',
                    fontFamily: 'var(--font-text)',
                    fontSize: 10,
                    lineHeight: 1.5,
                    letterSpacing: '0.4px',
                }}>{hint}</small>}
            </span>
            <span aria-hidden="true" style={{
                flex: '0 0 34px',
                width: 34,
                height: 16,
                boxSizing: 'border-box',
                marginTop: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: on ? 'flex-end' : 'flex-start',
                padding: 2,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line-strong)'}`,
            }}>
                <i style={{width: 10, height: 10, background: on ? 'var(--accent)' : 'var(--line-strong)'}}/>
            </span>
        </button>
    )
}
