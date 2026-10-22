import {type ChangeEventHandler, type InputHTMLAttributes, type ReactNode, useId, useState} from 'react'
import {LabelRow} from '../layout/LabelRow'

// 48px field on --bg-panel. The focused/active field is the only place in the
// product that gets an accent border AND a double glow (inset hairline plus an
// outer bloom) — it is where the user is being asked for something. No error
// state and no red: a bad value is prevented by the control, not punished after.
// The one exception is a soft `limit` for text that can arrive whole (dictation):
// it is never cut, and past the limit the field and counter turn --terracotta.

// ASCII whitespace only, as the service collapses it
const WHITESPACE = /[ \t\n\v\f\r]+/g

/** Code points of the value as a title stores it: trimmed, whitespace runs as one. */
function softLength(value: string): number {
    return [...value.trim().replace(WHITESPACE, ' ')].length
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'maxLength'> {
    label?: string
    placeholder?: string
    value: string
    onChange: ChangeEventHandler<HTMLInputElement>
    /** Character limit — drives the counter, which turns accent 4 short of it. */
    maxLength?: number
    /**
     * Soft limit instead of [maxLength]: input is never cut, the counter reads `N/limit` (code points of the trimmed
     * value) and past the limit the field turns --terracotta with `aria-invalid`.
     */
    limit?: number
    /** A control inside the field after the input, such as a dictation button. */
    trailing?: ReactNode
    /** Forces the visual focus treatment in static examples. Runtime focus is detected natively. */
    focused?: boolean
}

export function TextField({
                              label,
                              placeholder,
                              value,
                              onChange,
                              maxLength = 24,
                              limit,
                              trailing,
                              focused,
                              id,
                              disabled = false,
                              ...inputProps
                          }: TextFieldProps) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const [hasFocus, setHasFocus] = useState(false)
    const active = focused ?? hasFocus
    const empty = !value
    const length = limit === undefined ? value.length : softLength(value)
    const over = limit !== undefined && length > limit
    const counterColor = over
        ? 'var(--terracotta)'
        : limit === undefined && value.length > maxLength - 4 ? 'var(--accent)' : 'var(--text-faint)'
    const counter = !empty && (
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 10,
                letterSpacing: '0.5px',
                color: counterColor,
            }}
        >
      {limit === undefined ? `${String(value.length).padStart(2, '0')} / ${maxLength}` : `${length}/${limit}`}
    </span>
    )
    return (
        <div>
            {label && <LabelRow label={label} right={counter}/>}
            <div
                style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    background: 'var(--bg-panel)',
                    gap: 8,
                    border: over
                        ? '1px solid var(--terracotta)'
                        : active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                    boxShadow: active && !over
                        ? 'inset 0 0 0 1px var(--accent-glow-soft), 0 0 18px -6px var(--accent-glow-mid)'
                        : 'none',
                }}
            >
                <input
                    {...inputProps}
                    id={inputId}
                    aria-label={inputProps['aria-label'] ?? label}
                    value={value}
                    onChange={onChange}
                    maxLength={limit === undefined ? maxLength : undefined}
                    aria-invalid={over || inputProps['aria-invalid'] || undefined}
                    placeholder={placeholder}
                    disabled={disabled}
                    onFocus={(event) => {
                        setHasFocus(true)
                        inputProps.onFocus?.(event)
                    }}
                    onBlur={(event) => {
                        setHasFocus(false)
                        inputProps.onBlur?.(event)
                    }}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        padding: 0,
                        border: 0,
                        outline: 0,
                        background: 'transparent',
                        fontFamily: 'var(--font-text)',
                        fontSize: 14,
                        letterSpacing: '0.4px',
                        color: empty ? 'var(--text-faint)' : 'var(--cream)',
                        caretColor: 'var(--accent-2)',
                        opacity: disabled ? 0.5 : 1,
                        ...inputProps.style,
                    }}
                />
                {trailing}
            </div>
        </div>
    )
}
