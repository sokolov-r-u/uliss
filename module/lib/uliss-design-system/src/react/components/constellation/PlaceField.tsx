import {type ReactNode, useEffect, useRef, useState} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {LabelRow} from '../layout/LabelRow'

// A place as one collapsed 48px line: the chosen path, or a placeholder. A
// click unfolds the picker under it, over whatever follows, so the host keeps
// its size; it opens upwards when the room below is short and there is more
// above. A pick (the picker calls `close`) or Escape collapses it and gives
// the focus back to the line; a click outside only collapses it.

/** About the picker's height: search, five rows and the action. */
const POPOVER_ROOM = 340

export interface PlaceFieldProps {
    label: string
    /** The chosen place as the user reads it ("Music › Jazz"); null while there is none. */
    value: string | null
    placeholder?: string
    disabled?: boolean
    /** Shows a clear button while there is a value; it empties the place. */
    onClear?: () => void
    /** The picker under the line; it calls `close` once something is picked. */
    children: (close: () => void) => ReactNode
}

export function PlaceField({label, value, placeholder = 'Choose a place', disabled = false, onClear, children}:
                           PlaceFieldProps) {
    const [open, setOpen] = useState(false)
    const [upward, setUpward] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
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

    useEffect(() => {
        if (!shown) return
        const onPointerDown = (event: PointerEvent | MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        return () => document.removeEventListener('mousedown', onPointerDown)
    }, [shown])

    return (
        <div ref={rootRef} style={{position: 'relative'}} onKeyDown={(event) => {
            if (event.key !== 'Escape' || !shown) return
            // The field owns this Escape, from the line or the picker: a host dialog must not close with it.
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
                        onClick={() => {
                            if (!open && lineRef.current) {
                                const rect = lineRef.current.getBoundingClientRect()
                                const below = window.innerHeight - rect.bottom
                                setUpward(below < POPOVER_ROOM && rect.top > below)
                            }
                            setOpen(!open)
                        }}
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
            {shown && <div
                data-testid="place-field-popover"
                style={{position: 'absolute', [upward ? 'bottom' : 'top']: 'calc(100% + 4px)', left: 0, right: 0,
                    zIndex: 5}}>
                {children(close)}
            </div>}
        </div>
    )
}
