import type {ReactNode} from 'react'

// A destination in the sidebar / drawer. The five are fixed: Chats, Notes,
// Constellations, Sky, Updates — that order, every breakpoint. Selection = four
// coordinated shifts: --bg-surface ground, 2px --accent left edge, cream label
// at weight 500, accent-2 glyph. The inactive row keeps a 2px transparent edge
// so nothing shifts on selection. `dot` is the only badge — presence, never a
// count.

export interface NavRowProps {
    icon?: ReactNode
    label: string
    active?: boolean
    onClick?: () => void
    /** 5px accent square. Presence only — never a count. */
    dot?: boolean
}

export function NavRow({icon, label, active = false, onClick, dot = false}: NavRowProps) {
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 14px',
                cursor: 'pointer',
                background: active ? 'var(--bg-surface)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                color: active ? 'var(--cream)' : 'var(--cream-dim)',
                transition: 'color var(--dur-hover) var(--ease)',
            }}
        >
      <span style={{color: active ? 'var(--accent-2)' : 'var(--text-muted)', display: 'flex', flex: '0 0 auto'}}>
        {icon}
      </span>
            <span
                style={{
                    flex: 1,
                    fontFamily: 'var(--font-text)',
                    fontSize: 13,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    fontWeight: active ? 'var(--w-emphasis)' : 'var(--w-ui)',
                }}
            >
        {label}
      </span>
            {dot && <span style={{width: 5, height: 5, flex: '0 0 5px', background: 'var(--accent)'}}/>}
        </div>
    )
}
