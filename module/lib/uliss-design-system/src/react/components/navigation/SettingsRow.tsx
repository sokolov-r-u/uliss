import {Icon} from '../icons/Icon'

// A settings row: name, one hint line stating the CURRENT value, chevron. The
// hint is the whole point — the user reads their setting without opening it.
// Write the hint as data, never as blurb.

export interface SettingsRowProps {
    label: string
    /** The current value, ' · '-separated. Not a description. */
    hint?: string
    active?: boolean
    /** Suppresses the top hairline on the first row. */
    first?: boolean
    onClick?: () => void
}

export function SettingsRow({label, hint, active = false, first = false, onClick}: SettingsRowProps) {
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '15px 12px 15px 13px',
                borderTop: first ? 'none' : '1px solid var(--line)',
                background: active ? 'var(--bg-surface)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
      <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: 12,
                letterSpacing: '1.6px',
                textTransform: 'uppercase',
                color: active ? 'var(--cream)' : 'var(--cream-dim)',
                fontWeight: active ? 'var(--w-emphasis)' : 'var(--w-ui)',
            }}
        >
          {label}
        </span>
          {hint && (
              <span
                  style={{
                      fontFamily: 'var(--font-text)',
                      fontSize: 10,
                      color: 'var(--text-faint)',
                      letterSpacing: '0.5px',
                  }}
              >
            {hint}
          </span>
          )}
      </span>
            <span style={{color: active ? 'var(--accent-2)' : 'var(--text-faint)', display: 'flex'}}>
        <Icon name="chevron" size={12} rotate={-90}/>
      </span>
        </div>
    )
}
