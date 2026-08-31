import {Button} from '../actions/Button'

// Centred column: serif sentence, reading-scale explanation, one action. An
// empty Uliss says what will happen, not that something is missing. Copy rule:
// describe the future, never the lack.

export interface EmptyStateProps {
    /** Serif, balanced, sentence case, no full stop. */
    title: string
    body: string
    /** Label. Omit for states with nothing to do (an empty sky). */
    action?: string
    onAction?: () => void
    /** 21 default; 24 on the first-run screen. */
    titleSize?: number
}

export function EmptyState({title, body, action, onAction, titleSize = 21}: EmptyStateProps) {
    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: '0 34px',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: titleSize,
                    lineHeight: 1.25,
                    fontWeight: 'var(--w-ui)',
                    color: 'var(--cream)',
                    textWrap: 'balance',
                }}
            >
                {title}
            </div>
            <div
                style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: 'var(--read-size)',
                    lineHeight: 'var(--read-leading)',
                    fontWeight: 'var(--w-body)',
                    color: 'var(--text-muted)',
                    textWrap: 'pretty',
                }}
            >
                {body}
            </div>
            {action && (
                <Button variant="outline" size="lg" onClick={onAction} style={{marginTop: 6, color: 'var(--accent)'}}>
                    {action}
                </Button>
            )}
        </div>
    )
}
