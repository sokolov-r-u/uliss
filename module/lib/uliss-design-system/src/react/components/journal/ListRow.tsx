import type {ReactNode} from 'react'
import {Icon} from '../icons/Icon'

// One line per note or chat: unread dot · serif title · meta · date · menu.
// No cards, no thumbnails, no two-line previews, no relative time — the list is
// a dense table of contents, and the density is the point. `dim` greys read
// rows so unread ones surface without a badge.

export interface ListRowProps {
    title: string
    /** `<><Icon name="star" size={12}/>4</>` for a note's links, `noteDoc` for a chat's notes. */
    meta?: ReactNode
    /** Absolute and short — 'Jun 22'. Never relative. */
    date?: string
    unread?: boolean
    /** Read rows render --cream-dim. */
    dim?: boolean
    dots?: boolean
    onClick?: () => void
    onMenu?: () => void
    menuLabel?: string
}

export function ListRow({
                            title,
                            meta,
                            date,
                            unread = false,
                            dim = false,
                            dots = true,
                            onClick,
                            onMenu,
                            menuLabel
                        }: ListRowProps) {
    const content = (
        <>
            <span style={{width: 5, height: 5, flex: '0 0 5px', background: unread ? 'var(--accent)' : 'transparent'}}/>
            <span style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--font-text)',
                fontSize: 14,
                fontWeight: 'var(--w-body)',
                color: dim ? 'var(--cream-dim)' : 'var(--cream)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>{title}</span>
            <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-text)',
                fontSize: 10.5,
                flex: '0 0 auto'
            }}>{meta}</span>
            <span style={{
                fontFamily: 'var(--font-text)',
                fontSize: 10.5,
                letterSpacing: '0.5px',
                color: 'var(--text-faint)',
                width: 44,
                textAlign: 'right',
                flex: '0 0 44px'
            }}>{date}</span>
        </>
    )
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 34,
            }}
        >
            {onClick ? (
                <button type="button" onClick={onClick} style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 0',
                    background: 'transparent',
                    border: 0,
                    textAlign: 'left',
                    cursor: 'pointer'
                }}>
                    {content}
                </button>
            ) : (
                <div style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 0'
                }}>{content}</div>
            )}
            {dots && (
                <button
                    type="button"
                    aria-label={menuLabel ?? `Actions for ${title}`}
                    title={menuLabel ?? 'Rename · Delete'}
                    onClick={onMenu}
                    style={{
                        flex: '0 0 44px',
                        width: 44,
                        minHeight: 44,
                        marginRight: -14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 0,
                        color: 'var(--text-faint)',
                        cursor: 'pointer',
                    }}
                >
          <Icon name="dots" size={16}/>
                </button>
            )}
        </div>
    )
}
