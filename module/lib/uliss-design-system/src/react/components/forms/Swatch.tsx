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
}

export function Swatch({label, color, on = false, onPick}: SwatchProps) {
    return (
        <div
            onClick={onPick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 7,
                padding: '11px 6px 10px',
                background: on ? 'var(--bg-surface)' : 'transparent',
                border: on ? `1px solid ${color}` : '1px solid var(--line)',
                cursor: onPick ? 'pointer' : 'default',
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
        </div>
    )
}
