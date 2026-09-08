import type {ReactNode} from 'react'
import {IconButton} from '../actions/IconButton'
import {Icon} from '../icons/Icon'

// The screen header. The hamburger row IS the header — there is no wordmark
// here. Right of the menu sits label · count · title; `right` carries actions.
// Pass `center` to replace the middle wholesale (the search field does).

export interface TopBarProps {
    onMenu?: () => void
    /** Accent kicker — the screen name. 'Notes', 'Chats', 'Settings'. */
    label?: string
    /** Cinzel numeral — the total. 0 is a legitimate value; show it. */
    count?: number | string
    /** Serif single-line title, ellipsised. */
    title?: string
    /** Replaces label/count/title entirely — used by the search field. */
    center?: ReactNode
    /** Actions: a Kicker, an outlined Button, an icon. */
    right?: ReactNode
}

export function TopBar({onMenu, label, count, title, center, right}: TopBarProps) {
    const hasMid = label != null || count != null || title != null || center != null
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '5px 18px 5px', minHeight: 46}}>
            <span style={{flex: '0 0 30px', marginLeft: -7}}>
                <IconButton s={44} title="Open navigation" onClick={onMenu}><Icon name="menu" size={20}/></IconButton>
            </span>
            {hasMid ? (
                center != null ? (
                    <span style={{flex: 1, minWidth: 0, display: 'flex'}}>{center}</span>
                ) : (
                    <span style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9}}>
            {label != null && (
                <span
                    style={{
                        flex: '0 0 auto',
                        fontFamily: 'var(--font-text)',
                        fontSize: 10,
                        letterSpacing: '2.6px',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                    }}
                >
                {label}
              </span>
            )}
                        {count != null && (
                            <span
                                style={{
                                    flex: '0 0 auto',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 12.5,
                                    fontWeight: 'var(--w-strong)',
                                    color: 'var(--cream)',
                                    lineHeight: 1,
                                }}
                            >
                {count}
              </span>
                        )}
                        {title != null && (
                            <span
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    fontFamily: 'var(--font-text)',
                                    fontSize: 14.5,
                                    fontWeight: 'var(--w-ui)',
                                    color: 'var(--cream)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                {title}
              </span>
                        )}
          </span>
                )
            ) : (
                <span style={{flex: 1}}/>
            )}
            <span style={{flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10}}>{right}</span>
        </div>
    )
}
