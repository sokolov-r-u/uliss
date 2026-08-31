import type {CSSProperties, ReactNode} from 'react'
import {StarMark} from '../brand/StarMark'
import {Greek} from '../brand/Greek'
import {Button} from '../actions/Button'
import {Icon} from '../icons/Icon'
import {ProgressDots} from './ProgressDots'

// Corner ticks — the 'framed' variant's ceremony.
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

// The modal card. Three variants of ceremony:
//   plaque  — bg-deep, --line-strong edge, accent bloom (default)
//   framed  — double rule at inset 7 + corner ticks (the rare, formal one)
//   minimal — bg ground, a 34×2 accent rule under the title, no starmark

export interface NoticeProps {
    variant?: 'plaque' | 'framed' | 'minimal'
    /** No close, no secondary — the step must be finished. */
    blocking?: boolean
    /** Decorative gloss above the title. */
    greek?: string
    title: string
    body?: string
    /** The control this notice is asking through — TextField, OptionList, Select. */
    children?: ReactNode
    primary?: string
    secondary?: string
    /** Escape hatch for a blocking notice — 'Not now', 'Ask me later'. */
    skip?: string
    progress?: { current: number; total: number }
    onPrimary?: () => void
    onSecondary?: () => void
    onClose?: () => void
    width?: number
}

export function Notice({
                           variant = 'plaque',
                           blocking = false,
                           greek,
                           title,
                           body,
                           children,
                           primary = 'Continue',
                           secondary = 'Close',
                           skip,
                           progress,
                           onPrimary,
                           onSecondary,
                           onClose,
                           width = 304,
                       }: NoticeProps) {
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
        <div
            style={{
                position: 'relative',
                width,
                maxWidth: '100%',
                animation: 'uNoticeIn var(--dur-notice) var(--ease-notice) both',
            }}
        >
            <div style={{...shell, position: 'relative', overflow: 'hidden'}}>
                {variant === 'framed' && (
                    <div style={{
                        position: 'absolute',
                        inset: 7,
                        border: '1px solid var(--line-strong)',
                        pointerEvents: 'none'
                    }}/>
                )}
                {variant === 'framed' && <CornerTicks/>}
                <div style={{position: 'relative', padding: pad}}>
                    {!blocking && (
                        <div
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
                            paddingRight: !blocking ? 22 : 0,
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
                        {!blocking && (
                            <Button variant="ghost" onClick={onSecondary}>
                                {secondary}
                            </Button>
                        )}
                        <Button variant="primary" size="lg" full onClick={onPrimary}>
                            {primary}
                        </Button>
                    </div>
                    {blocking && skip && (
                        <div style={{marginTop: 10, display: 'flex', justifyContent: 'center'}}>
              <span
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
                </div>
            </div>
        </div>
    )
}
