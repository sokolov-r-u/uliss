import {Kicker} from '../brand/Kicker'

// Onboarding queue indicator: the current step is a 16px accent bar, done steps
// are 6px accent squares, future steps are hollow --bg-muted. The written
// "Step 01 / 03" sits opposite — the dots give shape, the words give certainty.

export interface ProgressDotsProps {
    /** 1-based. */
    current?: number
    total?: number
}

export function ProgressDots({current = 1, total = 3}: ProgressDotsProps) {
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
                                boxShadow: on ? '0 0 8px var(--accent-glow)' : 'none',
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
