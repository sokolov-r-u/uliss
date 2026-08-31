import type {ReactNode} from 'react'
import {Icon} from '../icons/Icon'

// The composer pinned to the bottom of a chat: a 46px --bg-panel field with a
// --line-strong edge and an inline mic tile. Voice and typing are the same
// dock; the mic is not a separate mode. `children` is centred in a strip above
// the field — that slot is where ActionChip goes.

export interface ChatDockProps {
    placeholder?: string
    onMic?: () => void
    /** Centred above the field — reserved for ActionChip. */
    children?: ReactNode
}

export function ChatDock({placeholder = 'Write a thought…', onMic, children}: ChatDockProps) {
    return (
        <div style={{padding: '10px 16px 18px', flex: '0 0 auto'}}>
            {children && <div style={{display: 'flex', justifyContent: 'center', marginBottom: 10}}>{children}</div>}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    height: 46,
                    padding: '0 6px 0 16px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--line-strong)',
                }}
            >
        <span
            style={{
                flex: 1,
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-text)',
                fontSize: 12.5,
                letterSpacing: '0.3px',
            }}
        >
          {placeholder}
        </span>
                <div
                    onClick={onMic}
                    style={{
                        width: 34,
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-muted)',
                        color: 'var(--accent-2)',
                        cursor: 'pointer',
                    }}
                >
                    <Icon name="mic" size={18}/>
                </div>
            </div>
        </div>
    )
}
