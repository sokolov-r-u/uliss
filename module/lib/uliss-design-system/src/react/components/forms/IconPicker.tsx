import {type KeyboardEvent, useEffect, useRef, useState} from 'react'
import {Icon} from '../icons/Icon'
import {EmojiPicker} from './EmojiPicker'

// A 48px square that shows a note's emoji (or a faint plus) next to its name field.
// On its own it opens an `EmojiPicker` under itself; Escape, a click outside or a
// second click close it. In a `Notice` the host shows the picker as the notice's own
// step instead (`open` + `onOpen`), so the card keeps its size.

interface IconPickerBase {
    /** Names the control: "Icon: 🎷", "Icon: none". */
    label: string
    value: string | null
    /** Served by the app itself; see `EmojiPicker`. */
    dataSource: string
    disabled?: boolean
}

interface IconPickerDropdown extends IconPickerBase {
    /** The picked emoji, or null when the user removes it. */
    onChange: (icon: string | null) => void
    open?: never
    onOpen?: never
}

interface IconPickerHosted extends IconPickerBase {
    /** The host shows the picker now (a `Notice` step); when it turns false the button takes the focus back. */
    open: boolean
    /** Asks the host to show the picker. */
    onOpen: () => void
    onChange?: never
}

export type IconPickerProps = IconPickerDropdown | IconPickerHosted

export function IconPicker(props: IconPickerProps) {
    const {label, value, dataSource, disabled = false} = props
    const hosted = props.onOpen !== undefined
    const [dropdown, setDropdown] = useState(false)
    const open = hosted ? props.open : dropdown
    const wrapRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const wasOpen = useRef(open)

    useEffect(() => {
        if (hosted && wasOpen.current && !open) buttonRef.current?.focus()
        wasOpen.current = open
    }, [hosted, open])

    useEffect(() => {
        if (!dropdown) return
        const onPointerDown = (event: PointerEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) setDropdown(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [dropdown])

    const closeDropdown = () => {
        setDropdown(false)
        buttonRef.current?.focus()
    }
    const choose = (icon: string | null) => {
        props.onChange?.(icon)
        closeDropdown()
    }
    const onKeyDown = (event: KeyboardEvent) => {
        if (!dropdown || event.key !== 'Escape') return
        // a host dialog's focus trap skips a handled Escape and stays open
        event.preventDefault()
        closeDropdown()
    }

    return (
        <div ref={wrapRef} onKeyDown={onKeyDown} style={{position: 'relative', flex: '0 0 auto'}}>
            <button ref={buttonRef} type="button" disabled={disabled} aria-label={`${label}: ${value ?? 'none'}`}
                    title="Choose an icon" aria-haspopup="dialog" aria-expanded={open}
                    onClick={() => (hosted ? props.onOpen() : setDropdown((shown) => !shown))}
                    style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        background: 'var(--bg-panel)',
                        border: `1px solid ${open ? 'var(--accent-2)' : 'var(--line-strong)'}`,
                        color: 'var(--text-faint)',
                        fontSize: 22,
                        lineHeight: 1,
                        opacity: disabled ? 0.5 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                    }}>
                {value ?? <Icon name="plus" size={14}/>}
            </button>
            {dropdown && <div role="dialog" aria-label="Choose an icon" style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                // above the page's menus (1050), under dialogs (1100)
                zIndex: 1060,
                padding: 8,
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)',
                boxShadow: 'var(--shadow-modal)',
            }}>
                <EmojiPicker dataSource={dataSource} onPick={choose}
                             onRemove={value ? () => choose(null) : undefined}/>
            </div>}
        </div>
    )
}
