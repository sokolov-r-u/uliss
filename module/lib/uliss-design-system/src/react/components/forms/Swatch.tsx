// Accent picker cell — a 26px circle of the actual colour, its own name below,
// and a border in that colour when chosen. The one place a component is
// coloured by a literal rather than a token: the swatch IS the value. (One of
// the three licensed circles.)
export interface SwatchProps {
    label: string
    /** The literal hex — this control shows values, not tokens. */
    color: string
    on?: boolean
    onPick?: () => void
    disabled?: boolean
}

export function Swatch({label, color, on = false, onPick, disabled = false}: SwatchProps) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onPick}
            onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return
                const radios = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? [])
                const index = radios.indexOf(event.currentTarget)
                if (index < 0 || radios.length === 0) return
                event.preventDefault()
                const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
                const next = radios[(index + delta + radios.length) % radios.length]
                next.focus()
                next.click()
            }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 7,
                padding: '11px 6px 10px',
                background: on ? 'var(--bg-surface)' : 'transparent',
                border: on ? `1px solid ${color}` : '1px solid var(--line)',
                color: 'inherit',
                font: 'inherit',
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : onPick ? 'pointer' : 'default',
            }}
        >
      <span
          style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: color,
              boxShadow: on ? `0 0 16px -2px ${color}` : 'none',
              border: '1px solid var(--accent-edge-soft)',
          }}
      />
            <span
                style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: 10,
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    color: on ? 'var(--cream)' : 'var(--text-faint)',
                }}
            >
        {label}
      </span>
        </button>
    )
}
