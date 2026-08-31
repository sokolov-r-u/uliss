import type {ReactNode} from 'react'

// A row of equal, checkable steps inside one 1px frame — no slider anywhere in
// Uliss. Each step shows its own effect (the reading scale renders "Aa" at its
// real size) plus a word, never a number.

export interface Step {
    id: string
    label: string
    short?: string
}

export interface StepControlProps {
    steps?: Step[]
    value?: string
    onPick?: (id: string) => void
    /** Taller cells — used where the step is a primary control. */
    big?: boolean
    /** Renders a preview above the label — e.g. "Aa" at that step's px. */
    renderStep?: (step: Step, active: boolean) => ReactNode
}

export function StepControl({steps = [], value, onPick, big = false, renderStep}: StepControlProps) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
                border: '1px solid var(--line)',
            }}
        >
            {steps.map((s, i) => {
                const on = s.id === value
                return (
                    <div
                        key={s.id}
                        onClick={onPick ? () => onPick(s.id) : undefined}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                            padding: big ? '13px 4px 12px' : '11px 4px 10px',
                            borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
                            background: on ? 'var(--bg-surface)' : 'transparent',
                            cursor: onPick ? 'pointer' : 'default',
                        }}
                    >
                        {renderStep && renderStep(s, on)}
                        <span
                            style={{
                                fontFamily: 'var(--font-text)',
                                fontSize: 10,
                                letterSpacing: '1.4px',
                                textTransform: 'uppercase',
                                color: on ? 'var(--cream)' : 'var(--text-faint)',
                            }}
                        >
              {s.short || s.label}
            </span>
                    </div>
                )
            })}
        </div>
    )
}
