import {Button} from '../actions/Button'

// The confirmation. Says what will happen and what survives, then offers a way
// out first and the act second. Panel ground, hard edge, two text buttons.
// `danger` turns the confirm label --terracotta — the only destructive signal
// in the product; there is no red anywhere.

export interface DialogProps {
    title: string
    /** What will happen and what survives. */
    body?: string
    confirm?: string
    cancel?: string
    /** Terracotta confirm label — deletions only. */
    danger?: boolean
    onConfirm?: () => void
    onCancel?: () => void
    width?: number
}

export function Dialog({
                           title,
                           body,
                           confirm = 'Confirm',
                           cancel = 'Not now',
                           danger = false,
                           onConfirm,
                           onCancel,
                           width = 280,
                       }: DialogProps) {
    return (
        <div
            onClick={onCancel}
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--scrim)',
                padding: 28,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: width,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--line-strong)',
                    padding: '22px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }}
            >
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 17,
                lineHeight: 1.35,
                color: 'var(--cream)',
                fontWeight: 'var(--w-ui)',
                textWrap: 'pretty',
            }}
        >
          {title}
        </span>
                {body && (
                    <span
                        style={{
                            fontFamily: 'var(--font-text)',
                            fontSize: 'var(--read-size)',
                            lineHeight: 'var(--read-leading)',
                            fontWeight: 'var(--read-weight)',
                            color: 'var(--text-muted)',
                            textWrap: 'pretty',
                        }}
                    >
            {body}
          </span>
                )}
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 4}}>
                    <Button variant="ghost" onClick={onCancel}>
                        {cancel}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onConfirm}
                        style={{
                            color: danger ? 'var(--terracotta)' : 'var(--accent-2)',
                            fontWeight: 'var(--w-emphasis)'
                        }}
                    >
                        {confirm}
                    </Button>
                </div>
            </div>
        </div>
    )
}
