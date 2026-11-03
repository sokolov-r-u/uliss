import {type ChangeEventHandler, type TextareaHTMLAttributes, useId, useLayoutEffect, useRef, useState} from 'react'
import {LabelRow} from '../layout/LabelRow'

// The multi-line sibling of TextField: same panel, same loud focus, same soft
// limit — the text is never cut, and past the limit the edge and counter turn
// --terracotta. It grows with its text from `rows` lines; it never scrolls
// inside a scrolling page.

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
    label?: string
    value: string
    onChange: ChangeEventHandler<HTMLTextAreaElement>
    /**
     * Soft limit: input is never cut, the counter reads `N/limit` (characters of the trimmed value) and past the
     * limit the field turns --terracotta with `aria-invalid`.
     */
    limit?: number
    /** Lines shown while the text is shorter. */
    rows?: number
}

export function TextArea({
                             label,
                             value,
                             onChange,
                             limit,
                             rows = 4,
                             id,
                             disabled = false,
                             ...textareaProps
                         }: TextAreaProps) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const [hasFocus, setHasFocus] = useState(false)
    const ref = useRef<HTMLTextAreaElement>(null)
    const length = value.trim().length
    const over = limit !== undefined && length > limit
    const counter = limit !== undefined && value !== '' && (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 10,
                letterSpacing: '0.5px',
                color: over ? 'var(--terracotta)' : 'var(--text-faint)',
            }}
        >
            {`${length}/${limit}`}
        </span>
    )
    // grows with the text: reset, then take the content height (never below `rows` lines)
    useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        element.style.height = 'auto'
        element.style.height = `${element.scrollHeight + 2}px`
    }, [value])
    return (
        <div>
            {(label || counter) && <LabelRow label={label ?? ''} right={counter}/>}
            <textarea
                {...textareaProps}
                ref={ref}
                id={inputId}
                aria-label={textareaProps['aria-label'] ?? label}
                value={value}
                onChange={onChange}
                rows={rows}
                disabled={disabled}
                aria-invalid={over || textareaProps['aria-invalid'] || undefined}
                onFocus={(event) => {
                    setHasFocus(true)
                    textareaProps.onFocus?.(event)
                }}
                onBlur={(event) => {
                    setHasFocus(false)
                    textareaProps.onBlur?.(event)
                }}
                style={{
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    resize: 'none',
                    overflow: 'hidden',
                    background: 'var(--bg-panel)',
                    border: over
                        ? '1px solid var(--terracotta)'
                        : hasFocus ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: hasFocus && !over
                        ? 'inset 0 0 0 1px var(--accent-glow-soft), 0 0 18px -6px var(--accent-glow-mid)'
                        : 'none',
                    outline: 0,
                    fontFamily: 'var(--font-text)',
                    fontSize: 14,
                    lineHeight: 1.5,
                    letterSpacing: '0.4px',
                    color: 'var(--cream)',
                    caretColor: 'var(--accent-2)',
                    opacity: disabled ? 0.5 : 1,
                    ...textareaProps.style,
                }}
            />
        </div>
    )
}
