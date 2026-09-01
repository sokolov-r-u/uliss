import type {CSSProperties, ReactNode} from 'react'

// The phone artboard: fills its frame, paints the ground, lays the craquelure
// overlay at --tex-opacity, draws the mock status bar, and gives its children a
// column to flow in. Every mobile screen in the product starts here.
//
// The status bar is mock device chrome — in the shipped PWA the real OS bar
// replaces it — so no product screen should mount one itself; only the artboard
// needs it. The 30px reserve stays either way, so layouts do not shift.
function MockStatusBar({time, color}: { time: string; color: string }) {
    return (
        <div
            style={{
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--gutter, 18px)',
                flex: '0 0 auto',
            }}
        >
      <span
          style={{
              fontFamily: 'var(--font-text)',
              fontSize: 11.5,
              fontWeight: 'var(--w-ui)',
              letterSpacing: '0.5px',
              fontVariantNumeric: 'tabular-nums',
              color,
          }}
      >
        {time}
      </span>
            <div style={{display: 'flex', alignItems: 'center', gap: 5, color}}>
                <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                    <rect x="0" y="6" width="2.4" height="4"/>
                    <rect x="3.6" y="4" width="2.4" height="6"/>
                    <rect x="7.2" y="2" width="2.4" height="8"/>
                    <rect x="10.8" y="0" width="2.4" height="10" opacity="0.4"/>
                </svg>
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="0.5" y="0.5" width="16" height="9"/>
                    <rect x="2" y="2" width="11" height="6" fill="currentColor" stroke="none"/>
                    <rect x="17.5" y="3" width="1.6" height="4" fill="currentColor" stroke="none"/>
                </svg>
            </div>
        </div>
    )
}

export interface PhoneScreenProps {
    children?: ReactNode
    /** Ground. --bg default; --bg-deep for the sky screens. */
    bg?: string
    time?: string
    statusColor?: string
    /** Off for a fragment mounted inside another artboard. */
    statusBar?: boolean
    style?: CSSProperties
}

export function PhoneScreen({
                                children,
                                bg = 'var(--bg)',
                                time = '9:41',
                                statusColor,
                                statusBar = true,
                                style = {},
                            }: PhoneScreenProps) {
    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: bg,
                color: 'var(--cream)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'var(--font-text)',
                ...style,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    mixBlendMode: 'overlay',
                    opacity: 'var(--tex-opacity, 0.5)',
                    backgroundImage: 'var(--texture-craquelure)',
                    backgroundSize: '300px',
                    zIndex: 0,
                }}
            />
            {statusBar && <MockStatusBar time={time} color={statusColor || 'var(--cream-dim)'}/>}
            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {children}
            </div>
        </div>
    )
}
