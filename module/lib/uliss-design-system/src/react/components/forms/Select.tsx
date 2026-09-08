import {type KeyboardEvent, useEffect, useId, useRef, useState} from 'react'
import {Greek} from '../brand/Greek'
import {Icon} from '../icons/Icon'
import {LabelRow} from '../layout/LabelRow'

export interface SelectOption<T extends string = string> {
    value: T
    label: string
    greek?: string
}

export interface SelectProps<T extends string = string> {
    label?: string
    greek?: string
    value: T | null
    placeholder?: string
    options: SelectOption<T>[]
    onChange: (value: T) => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
    disabled?: boolean
    name?: string
    'aria-label'?: string
}

/** Controlled, keyboard-operable single-select listbox with an optional controlled open state. */
export function Select<T extends string = string>({
                                                      label,
                                                      greek,
                                                      value,
                                                      placeholder = 'Select…',
                                                      options,
                                                      onChange,
                                                      open,
                                                      onOpenChange,
                                                      disabled = false,
                                                      name,
                                                      'aria-label': ariaLabel,
                                                  }: SelectProps<T>) {
    const generatedId = useId()
    const listboxId = `${generatedId}-listbox`
    const triggerRef = useRef<HTMLButtonElement>(null)
    const listboxRef = useRef<HTMLDivElement>(null)
    const [internalOpen, setInternalOpen] = useState(false)
    const selectedIndex = options.findIndex((option) => option.value === value)
    const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0))
    const requestedOpen = open ?? internalOpen
    const isOpen = !disabled && requestedOpen
    const current = selectedIndex >= 0 ? options[selectedIndex] : null

    const setOpen = (next: boolean, restoreFocus = false) => {
        if (disabled) return
        if (open === undefined) setInternalOpen(next)
        onOpenChange?.(next)
        if (!next && restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
    }

    useEffect(() => {
        if (!isOpen) return
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
        requestAnimationFrame(() => listboxRef.current?.focus())
    }, [isOpen, selectedIndex])

    useEffect(() => {
        if (!disabled || !requestedOpen) return
        if (open === undefined) setInternalOpen(false)
        onOpenChange?.(false)
    }, [disabled, requestedOpen, open, onOpenChange])

    const move = (delta: number) => {
        if (options.length === 0) return
        setActiveIndex((index) => (index + delta + options.length) % options.length)
    }

    const pick = (index: number) => {
        if (disabled) return
        const option = options[index]
        if (!option) return
        onChange(option.value)
        setOpen(false, true)
    }

    const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
        } else if (event.key === 'Home') {
            event.preventDefault()
            setActiveIndex(0)
        } else if (event.key === 'End') {
            event.preventDefault()
            setActiveIndex(Math.max(options.length - 1, 0))
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            pick(activeIndex)
        } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault()
            setOpen(false, event.key === 'Escape')
        }
    }

    return (
        <div style={{position: 'relative'}}>
            {label && <LabelRow label={label} greek={greek}/>}
            {name && <input type="hidden" name={name} value={value ?? ''}/>}
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel ?? label}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                onClick={() => setOpen(!isOpen)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        setOpen(true)
                    }
                }}
                style={{
                    width: '100%',
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 15px',
                    background: 'var(--bg-panel)',
                    color: current ? 'var(--cream)' : 'var(--text-faint)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    border: isOpen ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: isOpen ? '0 0 18px -6px var(--accent-glow-mid)' : 'none',
                    fontFamily: 'var(--font-text)',
                    fontSize: 13,
                    letterSpacing: '0.8px',
                    textAlign: 'left',
                }}
            >
                <span
                    style={{flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {current?.label ?? placeholder}
                </span>
                <span style={{
                    color: isOpen ? 'var(--accent-2)' : 'var(--text-muted)',
                    display: 'flex',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform var(--dur-hover) var(--ease)'
                }}>
                    <Icon name="chevron" size={14}/>
                </span>
            </button>
            {isOpen && (
                <div
                    ref={listboxRef}
                    id={listboxId}
                    role="listbox"
                    tabIndex={0}
                    aria-label={ariaLabel ?? label}
                    aria-activedescendant={options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
                    onKeyDown={onListKeyDown}
                    style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--line-strong)',
                        borderTop: 'none',
                        outline: 'none'
                    }}
                >
                    {options.map((option, index) => {
                        const selected = option.value === value
                        const active = index === activeIndex
                        return (
                            <div
                                key={option.value}
                                id={`${listboxId}-${index}`}
                                role="option"
                                aria-selected={selected}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => pick(index)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    minHeight: 44,
                                    padding: '0 15px',
                                    background: selected || active ? 'var(--bg-surface)' : 'transparent',
                                    borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
                                    color: selected ? 'var(--cream)' : 'var(--cream-dim)',
                                    fontFamily: 'var(--font-text)',
                                    fontSize: 12.5,
                                    letterSpacing: '0.8px',
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{flex: 1}}>{option.label}</span>
                                {option.greek && <Greek size={13}>{option.greek}</Greek>}
                                {selected && <span style={{color: 'var(--accent-2)', display: 'flex'}}><Icon name="tick"
                                                                                                             size={13}/></span>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
