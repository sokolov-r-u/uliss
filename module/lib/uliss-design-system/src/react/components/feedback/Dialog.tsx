import {type ReactNode, useId, useRef} from 'react'
import {useFocusTrap} from '../../hooks/useFocusTrap'
import {Button} from '../actions/Button'

// The confirmation. Says what will happen and what survives, then offers a way
// out first and the act second. Panel ground, hard edge, two text buttons.
// `danger` turns the confirm label --terracotta — the only destructive signal
// in the product; there is no red anywhere.

export interface DialogProps {
    title: string
    /** What will happen and what survives. */
    body?: string
    /** One field the confirmation asks through — a `TextField` for Rename. Sits between body and actions. */
    children?: ReactNode
    confirm?: string
    cancel?: string
    /** Terracotta confirm label — deletions only. */
    danger?: boolean
    onConfirm?: () => void
    onCancel?: () => void
    /** Greys the confirm action, e.g. a blank title. */
    confirmDisabled?: boolean
    /** Exposes `aria-busy` while the confirmed action runs. */
    busy?: boolean
    width?: number
}

export function Dialog({
                           title,
                           body,
                           children,
                           confirm = 'Confirm',
                           cancel = 'Not now',
                           danger = false,
                           onConfirm,
                           onCancel,
                           confirmDisabled = false,
                           busy = false,
                           width = 280,
                       }: DialogProps) {
    const titleId = useId()
    const dialogRef = useRef<HTMLDivElement>(null)

    useFocusTrap(dialogRef, {onEscape: onCancel})

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--scrim)',
                padding: 28,
            }}
        >
            {onCancel && <button type="button" tabIndex={-1} aria-hidden="true" onClick={onCancel} style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                padding: 0,
                border: 0,
                background: 'transparent',
                cursor: 'default'
            }}/>}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={busy || undefined}
                style={{
                    position: 'relative',
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
            id={titleId}
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
                {children}
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 4}}>
                    <Button variant="ghost" onClick={onCancel}>
                        {cancel}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onConfirm}
                        disabled={confirmDisabled}
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
