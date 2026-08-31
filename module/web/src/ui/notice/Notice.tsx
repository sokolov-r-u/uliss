/**
 * The Notice card — a backend-driven notice rendered centered over a dimmed app screen.
 * Visuals track the design-system `feedback/Notice`; kept interactive (button callbacks,
 * disabled/busy state, a `children` slot for controlled fields).
 *
 *   blocking = true  → must act; no X / secondary (optional `skip` escape hatch below)
 *   blocking = false → dismissible via X and a secondary button
 */
import type {CSSProperties, ReactNode} from 'react'
import {Button, Greek, Icon, Kicker, ProgressDots, StarMark} from '@uliss/design-system'
import './notice.css'

export type NoticeVariant = 'plaque' | 'framed' | 'minimal'

export interface NoticeProps {
    variant?: NoticeVariant
    /** No X / secondary; drives the "Required to continue" hint (or the `skip` link). */
    blocking?: boolean
    greek?: ReactNode
    title: ReactNode
    body?: ReactNode
    /** Kind-specific controlled fields (input / select / date …). */
    children?: ReactNode
    /** Queue indicator. */
    progress?: { current: number; total: number }
    primary?: string
    primaryDisabled?: boolean
    busy?: boolean
    onPrimary?: () => void
    /** Ghost button beside the primary — non-blocking notices only, needs label + handler. */
    secondary?: string
    onSecondary?: () => void
    /** Blocking escape hatch ('Skip for now') — a centred link, needs label + handler. */
    skip?: string
    onSkip?: () => void
    /** Top-right X — shown only when true and a handler is given. */
    showClose?: boolean
    onClose?: () => void
    width?: number
}

/** The 'framed' variant's ceremony. */
function CornerTicks({color = 'var(--accent)', size = 12}: { color?: string; size?: number }) {
    const base: CSSProperties = {position: 'absolute', width: size, height: size, pointerEvents: 'none'}
    const bt = `1px solid ${color}`
    return (
        <>
            <span style={{...base, top: 6, left: 6, borderTop: bt, borderLeft: bt}}/>
            <span style={{...base, top: 6, right: 6, borderTop: bt, borderRight: bt}}/>
            <span style={{...base, bottom: 6, left: 6, borderBottom: bt, borderLeft: bt}}/>
            <span style={{...base, bottom: 6, right: 6, borderBottom: bt, borderRight: bt}}/>
        </>
    )
}

export function Notice({
                           variant = 'plaque',
                           blocking = false,
                           greek,
                           title,
                           body,
                           children,
                           progress,
                           primary = 'Continue',
                           primaryDisabled = false,
                           busy = false,
                           onPrimary,
                           secondary,
                           onSecondary,
                           skip,
                           onSkip,
                           showClose = false,
                           onClose,
                           width = 304,
                       }: NoticeProps) {
    const closable = showClose && !!onClose
    const hasSecondary = !blocking && !!secondary && !!onSecondary
    const hasSkip = blocking && !!skip && !!onSkip
    const primaryOff = primaryDisabled || busy

    let shell: CSSProperties
    let pad = 26
    if (variant === 'plaque') {
        shell = {
            background: 'var(--bg-deep)',
            border: '1px solid var(--line-strong)',
            boxShadow: 'var(--shadow-modal), 0 0 46px -14px var(--accent-glow-soft)',
        }
    } else if (variant === 'framed') {
        pad = 30
        shell = {background: 'var(--bg-deep)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-modal)'}
    } else {
        pad = 30
        shell = {background: 'var(--bg)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow-modal)'}
    }

    return (
        <div style={{
            position: 'relative',
            width,
            maxWidth: '100%',
            animation: 'uNoticeIn var(--dur-notice) var(--ease-notice) both',
        }}>
            <div style={{...shell, position: 'relative', overflow: 'hidden'}}>
                {variant === 'framed' && (
                    <div style={{
                        position: 'absolute',
                        inset: 7,
                        border: '1px solid var(--line-strong)',
                        pointerEvents: 'none',
                    }}/>
                )}
                {variant === 'framed' && <CornerTicks/>}

                <div style={{position: 'relative', padding: pad}}>
                    {closable && (
                        <div
                            role="button"
                            aria-label="Close"
                            onClick={onClose}
                            style={{
                                position: 'absolute',
                                top: variant === 'framed' ? 14 : 12,
                                right: variant === 'framed' ? 14 : 12,
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                            }}
                        >
                            <Icon name="close" size={17}/>
                        </div>
                    )}

                    {progress && <ProgressDots current={progress.current} total={progress.total}/>}

                    {variant !== 'framed' && (
                        <div style={{marginBottom: 14}}>
                            <StarMark size={20}/>
                        </div>
                    )}

                    {greek && (
                        <div style={{marginBottom: 6}}>
                            <Greek size={13}>{greek}</Greek>
                        </div>
                    )}

                    <div
                        style={{
                            fontFamily: 'var(--font-text)',
                            fontSize: 21.5,
                            fontWeight: 'var(--w-ui)',
                            lineHeight: 1.2,
                            color: 'var(--cream)',
                            textWrap: 'balance',
                            marginBottom: variant === 'minimal' ? 10 : 12,
                            paddingRight: closable ? 22 : 0,
                        }}
                    >
                        {title}
                    </div>

                    {variant === 'minimal' && (
                        <div style={{width: 34, height: 2, background: 'var(--accent)', marginBottom: 14}}/>
                    )}

                    {body && (
                        <div
                            style={{
                                fontFamily: 'var(--font-text)',
                                fontSize: 11.5,
                                lineHeight: 1.65,
                                letterSpacing: '0.2px',
                                color: 'var(--text-muted)',
                                marginBottom: 20,
                                textWrap: 'pretty',
                            }}
                        >
                            {body}
                        </div>
                    )}

                    {children && <div style={{marginBottom: 22}}>{children}</div>}

                    <div style={{display: 'flex', gap: 10}}>
                        {hasSecondary && (
                            <Button variant="ghost" onClick={onSecondary}>
                                {secondary}
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            size="lg"
                            full
                            onClick={primaryOff ? undefined : onPrimary}
                            style={primaryOff ? {
                                opacity: 0.5,
                                cursor: 'not-allowed',
                                pointerEvents: 'none'
                            } : undefined}
                        >
                            {busy ? '…' : primary}
                        </Button>
                    </div>

                    {hasSkip && (
                        <div style={{marginTop: 10, display: 'flex', justifyContent: 'center'}}>
                            <span
                                role="button"
                                onClick={onSkip}
                                style={{
                                    minHeight: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 16px',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-text)',
                                    fontSize: 10,
                                    letterSpacing: '2px',
                                    textTransform: 'uppercase',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {skip}
                            </span>
                        </div>
                    )}

                    {blocking && !hasSkip && (
                        <div style={{marginTop: 14, textAlign: 'center'}}>
                            <Kicker size={8} spacing="2px" color="var(--text-faint)">
                                Required to continue
                            </Kicker>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
