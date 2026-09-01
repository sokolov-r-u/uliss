import {LabelRow} from '../layout/LabelRow'
import {Icon} from '../icons/Icon'

// A closed select is a quiet 48px row; open, it takes the accent border and
// drops a --bg-panel list beneath. The chevron flips, over 0.2s.

export interface SelectOption {
    label: string
}

export interface SelectProps {
    label?: string
    greek?: string
    value?: string | null
    placeholder?: string
    options?: (string | SelectOption)[]
    selected?: number
    open?: boolean
    onToggle?: () => void
    onPick?: (index: number) => void
}

export function Select({
                           label,
                           greek,
                           value = null,
                           placeholder = 'Select…',
                           options = [],
                           selected = -1,
                           open = false,
                           onToggle,
                           onPick,
                       }: SelectProps) {
    const empty = value == null
    return (
        <div style={{position: 'relative'}}>
            {label && <LabelRow label={label} greek={greek}/>}
            <div
                onClick={onToggle}
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 15px',
                    background: 'var(--bg-panel)',
                    cursor: 'pointer',
                    border: open ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: open ? '0 0 18px -6px var(--accent-glow-mid)' : 'none',
                }}
            >
        <span
            style={{
                flex: 1,
                fontFamily: 'var(--font-text)',
                fontSize: 13,
                letterSpacing: '0.8px',
                color: empty ? 'var(--text-faint)' : 'var(--cream)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
            }}
        >
          {value || placeholder}
        </span>
                <span
                    style={{
                        color: open ? 'var(--accent-2)' : 'var(--text-muted)',
                        display: 'flex',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform .2s',
                    }}
                >
          <Icon name="chevron" size={14}/>
        </span>
            </div>
            {open && (
                <div style={{background: 'var(--bg-panel)', border: '1px solid var(--line-strong)', borderTop: 'none'}}>
                    {options.map((o, i) => {
                        const on = i === selected
                        return (
                            <div
                                key={i}
                                onClick={onPick ? () => onPick(i) : undefined}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    height: 42,
                                    padding: '0 15px',
                                    background: on ? 'var(--bg-surface)' : 'transparent',
                                    borderLeft: on ? '2px solid var(--accent)' : '2px solid transparent',
                                    color: on ? 'var(--cream)' : 'var(--cream-dim)',
                                    fontFamily: 'var(--font-text)',
                                    fontSize: 12.5,
                                    letterSpacing: '0.8px',
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{flex: 1}}>{typeof o === 'string' ? o : o.label}</span>
                                {on && (
                                    <span style={{color: 'var(--accent-2)', display: 'flex'}}>
                    <Icon name="tick" size={13}/>
                  </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
