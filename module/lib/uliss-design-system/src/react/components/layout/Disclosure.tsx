import {type ReactNode, useId} from 'react'
import {Icon} from '../icons/Icon'

// A section that opens in place: the header reads like a settings row (name,
// one hint line, chevron) and the body unfolds under it. The body stays mounted
// while closed, so a half-edited form inside keeps its state.

export interface DisclosureProps {
    title: string
    /** One line under the title stating what is inside, as data. */
    hint?: string
    open: boolean
    onToggle: (open: boolean) => void
    children: ReactNode
    /** Suppresses the top hairline on the first section. */
    first?: boolean
}

export function Disclosure({title, hint, open, onToggle, children, first = false}: DisclosureProps) {
    const panelId = useId()
    return (
        <section style={{borderTop: first ? 'none' : '1px solid var(--line)'}}>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggle(!open)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '15px 12px 15px 13px',
                    border: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                }}
            >
                <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
                    <span
                        style={{
                            fontFamily: 'var(--font-text)',
                            fontSize: 12,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: open ? 'var(--cream)' : 'var(--cream-dim)',
                            fontWeight: open ? 'var(--w-emphasis)' : 'var(--w-ui)',
                        }}
                    >
                        {title}
                    </span>
                    {hint && (
                        <span
                            style={{
                                fontFamily: 'var(--font-text)',
                                fontSize: 10,
                                color: 'var(--text-faint)',
                                letterSpacing: '0.5px',
                            }}
                        >
                            {hint}
                        </span>
                    )}
                </span>
                <span style={{color: open ? 'var(--accent-2)' : 'var(--text-faint)', display: 'flex'}}>
                    <Icon name="chevron" size={12} rotate={open ? 180 : 0}/>
                </span>
            </button>
            <div id={panelId} hidden={!open} style={{padding: '0 13px 18px'}}>
                {children}
            </div>
        </section>
    )
}
