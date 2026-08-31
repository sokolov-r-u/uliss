import type {ReactNode} from 'react'
import {Icon} from '../icons/Icon'
import {Greek} from '../brand/Greek'

// The one pick-from-a-set row. Two markers, the same selection language:
//   tick (default) — settings options: ground presets, sky modes. Transparent
//                    ground when idle, an optional 46px preview on the left.
//   dot            — the visible radio used in onboarding notices, where the
//                    choice matters enough to be read in full. --bg-panel
//                    ground when idle; the ring is a 4px --accent-2 border over
//                    a --bg-deep core (one of the three licensed circles).
// Absorbed ChoiceList — it rendered this row with the `dot` marker and wrapped
// it in a column; use OptionList for the column.

export interface OptionCardProps {
    label: string
    /** One short line — 'Neutral black grounds'. */
    note?: string
    /** Decorative gloss, right-aligned. Onboarding surfaces only. */
    greek?: string
    /** 46×46 preview content — colour bands, a mini diagram. `tick` only. */
    preview?: ReactNode
    /** Fallback preview slot — `preview` wins when both are given. */
    children?: ReactNode
    marker?: 'tick' | 'dot'
    on?: boolean
    onPick?: () => void
}

export function OptionCard({
                               label,
                               note,
                               greek,
                               preview,
                               children,
                               marker = 'tick',
                               on = false,
                               onPick,
                           }: OptionCardProps) {
    const dot = marker === 'dot'
    const pv = preview != null ? preview : children
    return (
        <div
            onClick={onPick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: dot ? 12 : 13,
                padding: dot ? '0 15px' : '13px',
                minHeight: dot ? 48 : undefined,
                background: on ? 'var(--bg-surface)' : dot ? 'var(--bg-panel)' : 'transparent',
                border: on
                    ? '1px solid var(--accent)'
                    : `1px solid ${dot ? 'var(--line-strong)' : 'var(--line)'}`,
                boxShadow: on
                    ? dot
                        ? '0 0 18px -8px var(--accent-glow-mid)'
                        : '0 0 18px -10px var(--accent-glow)'
                    : 'none',
                cursor: onPick ? 'pointer' : 'default',
            }}
        >
            {dot && (
                <span
                    style={{
                        width: 15,
                        height: 15,
                        flex: '0 0 15px',
                        borderRadius: '50%',
                        border: on ? '4px solid var(--accent-2)' : '1px solid var(--line-strong)',
                        background: on ? 'var(--bg-deep)' : 'transparent',
                    }}
                />
            )}
            {!dot && pv && (
                <div
                    style={{
                        display: 'flex',
                        width: 46,
                        height: 46,
                        flex: '0 0 46px',
                        border: '1px solid var(--line-strong)',
                    }}
                >
                    {pv}
                </div>
            )}
            <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
        <span
            style={{
                fontFamily: 'var(--font-text)',
                fontSize: dot ? 12.5 : 11.5,
                letterSpacing: dot ? '0.8px' : '1.8px',
                textTransform: dot ? 'none' : 'uppercase',
                color: on ? 'var(--cream)' : 'var(--cream-dim)',
                fontWeight: on ? 'var(--w-emphasis)' : 'var(--w-ui)',
            }}
        >
          {label}
        </span>
                {note && (
                    <span
                        style={{
                            fontFamily: 'var(--font-text)',
                            fontSize: 10,
                            color: 'var(--text-faint)',
                            letterSpacing: '0.5px',
                        }}
                    >
            {note}
          </span>
                )}
      </span>
            {greek && <Greek size={13}>{greek}</Greek>}
            {!dot &&
                (on ? (
                    <span style={{color: 'var(--accent-2)', display: 'flex'}}>
            <Icon name="tick" size={13}/>
          </span>
                ) : (
                    <span style={{width: 13, height: 13, border: '1px solid var(--line-strong)'}}/>
                ))}
        </div>
    )
}

export interface OptionListProps {
    /** Strings, or the row props themselves. */
    options?: (string | OptionCardProps)[]
    selected?: number
    marker?: 'tick' | 'dot'
    onPick?: (index: number) => void
}

// The column the rows sit in: 8px apart, nothing hidden behind a dropdown.
export function OptionList({options = [], selected = 0, marker = 'dot', onPick}: OptionListProps) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {options.map((o, i) => {
                const c = typeof o === 'string' ? {label: o} : o
                return (
                    <OptionCard
                        key={i}
                        {...c}
                        marker={marker}
                        on={i === selected}
                        onPick={onPick ? () => onPick(i) : undefined}
                    />
                )
            })}
        </div>
    )
}
