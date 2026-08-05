/**
 * The Notice card — a backend-driven notice rendered centered over a dimmed app screen.
 * Ported from Claude Design `uliss-notify.jsx`; made interactive (button callbacks, disabled
 * state) and given a `children` slot for kind-specific controlled fields.
 *
 *   blocking = true  → must act, no close affordance (X / secondary hidden)
 *   blocking = false → dismissible via X and a secondary button
 */
import type {CSSProperties, ReactNode} from 'react'
import {Kicker} from '@uliss/design-system'
import {Greek, IcClose, StarMark} from './glyphs'
import './notice.css'

export type NoticeVariant = 'plaque' | 'framed' | 'minimal'

export interface NoticeProps {
    variant?: NoticeVariant
    /** Drives the "Required to continue" hint (and, in the queue host, non-dismissability). */
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
    /** Secondary (ghost) button — shown only when both label and handler are given. */
    secondary?: string
    onSecondary?: () => void
    /** Top-right X — shown only when true and a handler is given. */
    showClose?: boolean
    onClose?: () => void
    width?: number
}

function Progress({current, total}: { current: number; total: number }) {
    return (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 7}}>
                {Array.from({length: total}).map((_, i) => {
                    const done = i < current - 1
                    const on = i === current - 1
                    return (
                        <span
                            key={i}
                            style={{
                                width: on ? 16 : 6,
                                height: 6,
                                background: done || on ? 'var(--accent-2)' : 'var(--bg-muted)',
                                border: done || on ? 'none' : '1px solid var(--line-strong)',
                                boxShadow: on ? '0 0 8px rgba(217,154,78,.55)' : 'none',
                                transition: 'all .3s',
                            }}
                        />
                    )
                })}
            </div>
            <Kicker size={8.5} spacing="2.5px" color="var(--text-faint)">
                Step {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </Kicker>
        </div>
    )
}

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

function PrimaryBtn({children, disabled, onClick}: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="notice-btn"
            disabled={disabled}
            onClick={onClick}
            style={{
                flex: 1,
                height: 48,
                border: '1px solid rgba(240,192,106,.5)',
                background: 'linear-gradient(160deg, var(--accent-2), var(--accent) 75%, var(--terracotta-deep))',
                color: 'var(--bg-deep)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                boxShadow: '0 0 24px -6px rgba(217,154,78,.55)',
            }}
        >
            {children}
        </button>
    )
}

function GhostBtn({children, onClick}: { children: ReactNode; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="notice-btn"
            onClick={onClick}
            style={{
                flex: '0 0 auto',
                minWidth: 96,
                height: 48,
                padding: '0 20px',
                background: 'transparent',
                border: '1px solid var(--line-strong)',
                color: 'var(--cream-dim)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
            }}
        >
            {children}
        </button>
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
                           showClose = false,
                           onClose,
                           width = 304,
                       }: NoticeProps) {
    const closable = showClose && !!onClose
    const hasSecondary = !!secondary && !!onSecondary
    let shell: CSSProperties
    let pad = 26
    if (variant === 'plaque') {
        shell = {
            background: 'var(--bg-deep)',
            border: '1px solid var(--line-strong)',
            boxShadow: '0 34px 90px -24px rgba(0,0,0,.8), 0 0 46px -14px rgba(217,154,78,.14)',
        }
    } else if (variant === 'framed') {
        pad = 30
        shell = {
            background: 'var(--bg-deep)',
            border: '1px solid var(--line)',
            boxShadow: '0 34px 90px -24px rgba(0,0,0,.8)'
        }
    } else {
        pad = 30
        shell = {
            background: 'var(--bg)',
            border: '1px solid var(--line-strong)',
            boxShadow: '0 34px 90px -24px rgba(0,0,0,.78)'
        }
    }

    return (
        <div style={{
            position: 'relative',
            width,
            maxWidth: '100%',
            animation: 'uNoticeIn .5s cubic-bezier(.2,.7,.2,1) both'
        }}>
            <div style={{...shell, position: 'relative', overflow: 'hidden'}}>
                {variant === 'plaque' && (
                    <div
                        style={{
                            height: 12,
                            backgroundImage: 'var(--meander-h)',
                            backgroundRepeat: 'repeat-x',
                            backgroundPosition: 'center',
                            backgroundSize: 'auto 12px',
                            opacity: 0.42,
                        }}
                    />
                )}
                {variant === 'framed' && <div style={{
                    position: 'absolute',
                    inset: 7,
                    border: '1px solid var(--line-strong)',
                    pointerEvents: 'none'
                }}/>}
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
                            <IcClose s={17}/>
                        </div>
                    )}

                    {progress && <Progress current={progress.current} total={progress.total}/>}

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
                            fontFamily: 'var(--font-serif)',
                            fontSize: 25,
                            fontWeight: 500,
                            lineHeight: 1.15,
                            color: 'var(--cream)',
                            textWrap: 'balance',
                            marginBottom: variant === 'minimal' ? 10 : 12,
                            paddingRight: closable ? 22 : 0,
                        }}
                    >
                        {title}
                    </div>

                    {variant === 'minimal' &&
                        <div style={{width: 34, height: 2, background: 'var(--accent)', marginBottom: 14}}/>}

                    {body && (
                        <div
                            style={{
                                fontFamily: 'var(--font-mono)',
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
                        {hasSecondary && <GhostBtn onClick={onSecondary}>{secondary}</GhostBtn>}
                        <PrimaryBtn disabled={primaryDisabled || busy} onClick={onPrimary}>
                            {busy ? '…' : primary}
                        </PrimaryBtn>
                    </div>

                    {blocking && (
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
