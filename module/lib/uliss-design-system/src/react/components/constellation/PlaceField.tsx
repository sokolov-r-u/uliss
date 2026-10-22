import {useEffect, useRef} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {LabelRow} from '../layout/LabelRow'

// A place as one collapsed 48px line: the chosen path, or a placeholder. A
// click asks the host to show the picker — in a dialog, as the dialog's own
// next step (`Notice` `step`), so the card keeps its size and style. When the
// host closes the picker, the line takes the focus back.

export interface PlaceFieldProps {
    label: string
    /** The chosen place as the user reads it ("Music › Jazz"); null while there is none. */
    value: string | null
    placeholder?: string
    /** The host shows the picker now. */
    open: boolean
    /** Asks the host to show the picker. */
    onOpen: () => void
    disabled?: boolean
    /** Shows a clear button while there is a value; it empties the place. */
    onClear?: () => void
}

export function PlaceField({label, value, placeholder = 'Choose a place', open, onOpen, disabled = false, onClear}:
                           PlaceFieldProps) {
    const lineRef = useRef<HTMLButtonElement>(null)
    const wasOpen = useRef(open)

    useEffect(() => {
        if (wasOpen.current && !open) lineRef.current?.focus()
        wasOpen.current = open
    }, [open])

    return (
        <div>
            <LabelRow label={label}/>
            <div style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)',
                opacity: disabled ? 0.5 : 1,
            }}>
                <button ref={lineRef} type="button" disabled={disabled} aria-expanded={open}
                        aria-label={`${label}: ${value ?? placeholder}`} onClick={onOpen}
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
                        <Icon name="chevron" size={10} rotate={-90}/>
                    </span>
                </button>
                {value && onClear && <IconButton s={44} title="Clear the place" disabled={disabled} onClick={() => {
                    onClear()
                    lineRef.current?.focus()
                }}><Icon name="close" size={12}/></IconButton>}
            </div>
        </div>
    )
}
