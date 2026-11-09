import {type CSSProperties, type ReactNode, useId} from 'react'
import {Kicker} from '../brand/Kicker'
import {Icon} from '../icons/Icon'

// A section that opens in place. `row`: the header reads like a settings row
// (name, one hint line, chevron) and the body unfolds under it. `section`: a
// Kicker header with the hint on its right, as the sections of a details panel;
// the host gives the section its padding and hairline. The body stays mounted
// while closed, so a half-edited form inside keeps its state.

export interface DisclosureProps {
    title: string
    /** What is inside, as data: under the title in a row, right of it in a section. */
    hint?: string
    open: boolean
    onToggle: (open: boolean) => void
    children: ReactNode
    /** `row` (default) for settings screens; `section` for a details panel's sections. */
    variant?: 'row' | 'section'
    /** row only: suppresses the top hairline on the first section. */
    first?: boolean
    /** section only: icon buttons between the title and the chevron, shown while open (Edit, Remove). */
    actions?: ReactNode
}

export function Disclosure({
                               title, hint, open, onToggle, children, variant = 'row', first = false, actions,
                           }: DisclosureProps) {
    const panelId = useId()
    const chevron = <span style={{color: open ? 'var(--accent-2)' : 'var(--text-faint)', display: 'flex'}}>
        <Icon name="chevron" size={12} rotate={open ? 180 : 0}/>
    </span>
    if (variant === 'section') {
        const toggle: CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            minHeight: 'var(--touch)',
            padding: 0,
            border: 0,
            background: 'transparent',
            font: 'inherit',
            color: 'inherit',
            cursor: 'pointer',
        }
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                {/* the 44px targets overhang the 30px header line, so the section keeps its rhythm */}
                <div style={{display: 'flex', alignItems: 'center', gap: 4, margin: '-7px 0'}}>
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => onToggle(!open)}
                        style={{...toggle, flex: 1, minWidth: 0, gap: 10, textAlign: 'left'}}
                    >
                        <Kicker size={9} spacing="2.5px" color={open ? 'var(--cream-dim)' : 'var(--text-muted)'}>
                            {title}
                        </Kicker>
                        <span style={{flex: 1}}/>
                        {hint && (
                            <span style={{fontFamily: 'var(--font-text)', fontSize: 11, color: 'var(--text-faint)'}}>
                                {hint}
                            </span>
                        )}
                    </button>
                    {open && actions}
                    {/* a second hit area for the chevron after the actions; the header button above is the control */}
                    <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => onToggle(!open)}
                            style={{...toggle, justifyContent: 'flex-end', width: 22}}>
                        {chevron}
                    </button>
                </div>
                <div id={panelId} hidden={!open}>
                    {children}
                </div>
            </div>
        )
    }
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
                {chevron}
            </button>
            <div id={panelId} hidden={!open} style={{padding: '0 13px 18px'}}>
                {children}
            </div>
        </section>
    )
}
