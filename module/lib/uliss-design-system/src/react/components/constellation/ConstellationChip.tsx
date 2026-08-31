import {TagDot} from './TagDot'

// Membership, as plain text behind a coloured dot — no box, no fill, no pill.
// Secondary memberships only: the dominant constellation is shown as an accent
// path trail (root › … › leaf), not as a chip.

export interface ConstellationChipProps {
    label: string
    color: string
    /** sm inside dense rows and lists; md on the note meta plate. */
    size?: 'sm' | 'md'
    /** Shows a × — only where the user owns the membership. */
    onRemove?: () => void
    onClick?: () => void
}

export function ConstellationChip({label, color, size = 'md', onRemove, onClick}: ConstellationChipProps) {
    const sm = size === 'sm'
    return (
        <span
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: sm ? 5 : 6,
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
      <TagDot color={color} size={sm ? 5 : 7}/>
      <span
          style={{
              fontFamily: 'var(--font-text)',
              fontSize: sm ? 10 : 11,
              letterSpacing: '0.8px',
              color: 'var(--cream-dim)',
          }}
      >
        {label}
      </span>
            {onRemove && (
                <span
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove?.()
                    }}
                    style={{
                        color: 'var(--text-faint)',
                        fontFamily: 'var(--font-text)',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '0 2px',
                    }}
                >
          ×
        </span>
            )}
    </span>
    )
}
