import {type CSSProperties, type ReactNode, useId} from 'react'
import {StarMark} from '../brand/StarMark'
import {Button} from '../actions/Button'
import {IconButton} from '../actions/IconButton'
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
    title: ReactNode
    body?: ReactNode
    /** The control this notice is asking through — TextField, OptionList, Select. */
    children?: ReactNode
    primary?: string
    secondary?: string
    /** Escape hatch for a blocking notice — 'Not now', 'Ask me later'. Needs `onSkip`. */
    skip?: string
    progress?: { current: number; total: number }
    onPrimary?: () => void
    onSecondary?: () => void
    onSkip?: () => void
    onClose?: () => void
    primaryDisabled?: boolean
    /** Keeps the secondary action in place but unavailable, so the card does not change size. */
    secondaryDisabled?: boolean
    busy?: boolean
    showClose?: boolean
    width?: number
    /**
     * A second step of the same question drawn in the same card at the same size: its title and content cover the
     * first step, which stays (hidden, inert) only to hold the size. Its corner button and Escape call `onBack`.
     */
    step?: { title: ReactNode; children: ReactNode; onBack: () => void }
}

export function Notice({
                           variant = 'plaque',
                           blocking = false,
                           title,
                           body,
                           children,
                           primary = 'Continue',
                           secondary,
                           skip,
                           progress,
                           onPrimary,
                           onSecondary,
                           onSkip,
                           onClose,
                           primaryDisabled = false,
                           secondaryDisabled = false,
                           busy = false,
                           showClose = false,
                           width = 304,
                           step,
                       }: NoticeProps) {
    const titleId = useId()
    const stepTitleId = useId()
    const hasSkip = blocking && !!skip && !!onSkip
    const hasSecondary = !blocking && !!secondary && !!onSecondary
    const closable = !blocking && showClose && !!onClose
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
    const titleStyle: CSSProperties = {
        fontFamily: 'var(--font-text)',
        fontSize: 21.5,
        fontWeight: 'var(--w-ui)',
        lineHeight: 1.2,
        color: 'var(--cream)',
        textWrap: 'balance',
        marginBottom: variant === 'minimal' ? 10 : 12,
        paddingRight: closable || step ? 22 : 0,
    }
    const corner: CSSProperties = {
        position: 'absolute',
        top: variant === 'framed' ? 14 : 12,
        right: variant === 'framed' ? 14 : 12,
    }
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={step ? stepTitleId : titleId}
            aria-busy={busy || undefined}
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
                    <div inert={step != null || undefined} style={step ? {visibility: 'hidden'} : undefined}>
                    {closable && (
                        <div style={corner}>
                            <IconButton title="Close" onClick={onClose} s={30}><Icon name="close"
                                                                                     size={17}/></IconButton>
                        </div>
                    )}
                    {progress && <ProgressDots current={progress.current} total={progress.total}/>}
                    {variant !== 'framed' && (
                        <div style={{marginBottom: 14}}>
                            <StarMark size={20}/>
                        </div>
                    )}
                    <div id={titleId} style={titleStyle}>
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
                            <Button variant="ghost" onClick={onSecondary} disabled={secondaryDisabled}>
                                {secondary}
                            </Button>
                        )}
                        {primary && (
                            <Button variant="primary" size="lg" full onClick={onPrimary}
                                    disabled={primaryDisabled || busy}>
                                {busy ? 'Working…' : primary}
                            </Button>
                        )}
                    </div>
                    {hasSkip && (
                        <div style={{marginTop: 10, display: 'flex', justifyContent: 'center'}}>
                            <button
                                type="button"
                                disabled={busy}
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
                      border: 0,
                      background: 'transparent',
                  }}
              >
                {skip}
                            </button>
                        </div>
                    )}
                    </div>
                    {step && (
                        <div
                            onKeyDown={(event) => {
                                if (event.key !== 'Escape') return
                                // Escape steps back; the overlay must not close the notice with it
                                event.preventDefault()
                                event.stopPropagation()
                                step.onBack()
                            }}
                            style={{position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column'}}
                        >
                            <div style={corner}>
                                <IconButton title="Back" onClick={step.onBack} s={30}>
                                    <Icon name="chevron" size={17} rotate={90}/></IconButton>
                            </div>
                            {variant !== 'framed' && (
                                <div style={{marginBottom: 14}}>
                                    <StarMark size={20}/>
                                </div>
                            )}
                            <div id={stepTitleId} style={titleStyle}>{step.title}</div>
                            <div style={{flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column'}}>
                                {step.children}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
