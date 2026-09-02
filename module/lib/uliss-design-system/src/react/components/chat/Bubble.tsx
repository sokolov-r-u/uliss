import type {CSSProperties, ReactNode} from 'react'
import {Kicker} from '../brand/Kicker'

// One reading face for both speakers, one size, one colour. Who is talking is
// told by alignment and the side of a 2px rule — never by typeface, weight, a
// filled block or a glow. Uliss gets a name label; the user does not. Body type
// stays on the reading tokens so Settings › Text size drives it.

export interface BubbleProps {
    role: 'me' | 'uliss'
    children?: ReactNode
}

export function Bubble({role, children}: BubbleProps) {
    const body: CSSProperties = {
        fontFamily: 'var(--font-text)',
        fontSize: 'var(--read-size)',
        lineHeight: 'var(--read-leading)',
        fontWeight: 'var(--read-weight)',
        color: 'var(--read-fg)',
        whiteSpace: 'pre-wrap',
        textWrap: 'pretty',
    }
    if (role === 'me') {
        return (
            <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 20}}>
                <div style={{maxWidth: '84%', borderRight: '2px solid var(--line-strong)', paddingRight: 14, ...body}}>
                    {children}
                </div>
            </div>
        )
    }
    return (
        <div style={{marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8}}>
            <Kicker size={8.5} spacing="3px" color="var(--cream)">
                Uliss
            </Kicker>
            <div style={{borderLeft: '2px solid var(--accent)', paddingLeft: 14, ...body}}>{children}</div>
        </div>
    )
}
