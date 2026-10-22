import {type ReactNode, useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useFocusTrap} from '../../hooks/useFocusTrap'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {LabelRow} from '../layout/LabelRow'

// A place as one collapsed 48px line: the chosen path, or a placeholder. A
// click opens the picker in a large sheet of its own over the page (the whole
// screen on a phone), so the host keeps its size and never clips it. A pick
// (the picker calls `close`), Escape or a click on the backdrop closes the
// sheet and gives the focus back to the line.

// Sheet size by breakpoint: inline styles cannot hold the media query.
const SHEET_CSS = '.u-place-sheet{width:min(640px,calc(100vw - 48px));height:min(760px,80vh)}'
    + '@media (max-width:767px){.u-place-sheet{width:100vw;height:100dvh}}'

/** The sheet's panel: it keeps the focus inside while open and gives it back on close. */
function PlaceSheet({label, children}: { label: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(ref)
    return <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="u-place-sheet"
                style={{position: 'relative', display: 'flex', flexDirection: 'column'}}>{children}</div>
}

export interface PlaceFieldProps {
    label: string
    /** The chosen place as the user reads it ("Music › Jazz"); null while there is none. */
    value: string | null
    placeholder?: string
    disabled?: boolean
    /** Shows a clear button while there is a value; it empties the place. */
    onClear?: () => void
    /** The picker in the sheet (give it `fill`); it calls `close` once something is picked. */
    children: (close: () => void) => ReactNode
}

export function PlaceField({label, value, placeholder = 'Choose a place', disabled = false, onClear, children}:
                           PlaceFieldProps) {
    const [open, setOpen] = useState(false)
    const lineRef = useRef<HTMLButtonElement>(null)
    const shown = open && !disabled

    // a field disabled while open stays shut when it is enabled again
    useEffect(() => {
        if (disabled) setOpen(false)
    }, [disabled])

    const close = () => {
        setOpen(false)
        lineRef.current?.focus()
    }

    return (
        <div onKeyDown={(event) => {
            if (event.key !== 'Escape' || !shown) return
            // The field owns this Escape, also from the sheet (a portal): a host dialog must not close with it.
            event.preventDefault()
            event.stopPropagation()
            close()
        }}>
            <LabelRow label={label}/>
            <div style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-panel)',
                border: `1px solid ${shown ? 'var(--accent)' : 'var(--line-strong)'}`,
                opacity: disabled ? 0.5 : 1,
            }}>
                <button ref={lineRef} type="button" disabled={disabled} aria-expanded={shown}
                        aria-label={`${label}: ${value ?? placeholder}`}
                        onClick={() => setOpen(true)}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 14px',
                            border: 0,
                            background: 'transparent',
                            textAlign: 'left',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                        }}>
                    <span style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-text)',
                        fontSize: 14,
                        letterSpacing: '0.4px',
                        color: value ? 'var(--cream)' : 'var(--text-faint)',
                    }}>{value ?? placeholder}</span>
                    <span style={{display: 'flex', color: 'var(--text-faint)'}}>
                        <Icon name="chevron" size={10} rotate={shown ? 180 : 0}/>
                    </span>
                </button>
                {value && onClear && <IconButton s={44} title="Clear the place" disabled={disabled} onClick={() => {
                    onClear()
                    lineRef.current?.focus()
                }}><Icon name="close" size={12}/></IconButton>}
            </div>
            {shown && createPortal(
                <div style={{position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center',
                    justifyContent: 'center'}}>
                    <style>{SHEET_CSS}</style>
                    <button type="button" tabIndex={-1} aria-hidden="true" data-testid="place-field-backdrop"
                            onClick={close} style={{position: 'absolute', inset: 0, padding: 0, border: 0,
                        background: 'var(--scrim)', cursor: 'default'}}/>
                    <PlaceSheet label={label}>{children(close)}</PlaceSheet>
                </div>,
                document.body,
            )}
        </div>
    )
}
