import type {CSSProperties} from 'react'

// One line of hint, progress or error under a control, with its height reserved
// for the longest text (`lines`), so the layout never jumps when the message
// changes. TextField keeps its rule of no error styling; the message carries it.

export type FieldMessageTone = 'hint' | 'busy' | 'ok' | 'error'

export interface FieldMessageProps {
    text: string
    tone?: FieldMessageTone
    /** Lines reserved, 16px each; size it for the longest message at the narrowest width. */
    lines?: number
    /** Referenced by the field's `aria-describedby`. */
    id?: string
    style?: CSSProperties
}

const COLORS: Record<FieldMessageTone, string> = {
    hint: 'var(--text-faint)',
    busy: 'var(--text-muted)',
    ok: 'var(--cream-dim)',
    error: 'var(--terracotta)',
}

const MARKS: Partial<Record<FieldMessageTone, string>> = {error: '!', ok: '✓'}

export function FieldMessage({text, tone = 'hint', lines = 2, id, style}: FieldMessageProps) {
    const height = lines * 16
    const mark = MARKS[tone]
    return (
        <p
            id={id}
            role={tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            style={{
                margin: 0,
                width: '100%',
                boxSizing: 'border-box',
                minHeight: height,
                maxHeight: height,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                fontFamily: 'var(--font-text)',
                fontSize: 11,
                lineHeight: '16px',
                letterSpacing: '0.2px',
                color: COLORS[tone],
                textWrap: 'pretty',
                ...style,
            }}
        >
            {mark && <span aria-hidden="true" style={{flex: '0 0 auto'}}>{mark}</span>}
            <span>{text}</span>
        </p>
    )
}
