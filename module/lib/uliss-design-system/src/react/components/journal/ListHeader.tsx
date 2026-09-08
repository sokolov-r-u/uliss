import type {ReactNode} from 'react'
import {Kicker} from '../brand/Kicker'

// Accent kicker over a Cinzel total, one optional action on the right. The
// numeral in display type is deliberate — the count is the one number the user
// watches grow. On phone this collapses into TopBar's label + count.

export interface ListHeaderProps {
    kicker?: string
    total?: number | string
    right?: ReactNode
}

export function ListHeader({kicker, total, right}: ListHeaderProps) {
    return (
        <div
            style={{
                padding: '8px 18px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 12,
            }}
        >
            <div style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                <Kicker size={9} spacing="3px" color="var(--accent)">
                    {kicker}
                </Kicker>
                <span
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 22,
                        fontWeight: 'var(--w-strong)',
                        color: 'var(--cream)',
                        lineHeight: 1,
                    }}
                >
          {total}
        </span>
            </div>
            {right}
        </div>
    )
}
