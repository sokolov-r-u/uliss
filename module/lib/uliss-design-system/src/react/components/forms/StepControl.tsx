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
    label?: string
    disabled?: boolean
}

export function StepControl({
                                steps = [],
                                value,
                                onPick,
                                big = false,
                                renderStep,
                                label,
                                disabled = false
                            }: StepControlProps) {
    return (
        <div
            role="radiogroup"
            aria-label={label}
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
                border: '1px solid var(--line)',
            }}
        >
            {steps.map((s, i) => {
                const on = s.id === value
                return (
                    <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={disabled}
                        key={s.id}
                        onClick={onPick ? () => onPick(s.id) : undefined}
                        tabIndex={on ? 0 : -1}
                        onKeyDown={(event) => {
                            if (!onPick || disabled || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return
                            event.preventDefault()
                            const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
                            const next = (i + delta + steps.length) % steps.length
                            onPick(steps[next].id)
                            requestAnimationFrame(() => event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus())
                        }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                            padding: big ? '13px 4px 12px' : '11px 4px 10px',
                            borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
                            background: on ? 'var(--bg-surface)' : 'transparent',
                            borderTop: 'none',
                            borderRight: 'none',
                            borderBottom: 'none',
                            color: 'inherit',
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? 'not-allowed' : onPick ? 'pointer' : 'default',
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
                    </button>
                )
            })}
        </div>
    )
}
