import {useMemo, useState} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'
import {TagDot} from './TagDot'

// The one place-picker of the constellation tree: a search field over the whole
// tree, rows indented by depth with the ancestors' path under each name. Used to
// move a branch, and later to place a note. An optional first row ("Make it a
// root") and an optional last row ("Create “…”") frame the hits.

export interface ConstellationPickerItem {
    id: string
    name: string
    /** 0 for a root. */
    depth: number
    /** Ancestor names, root first; empty for a root. */
    path: string[]
    /** Resolved branch colour (`constellationColor`). */
    color: string
    /** Stars in the subtree; omitted hides the count. */
    count?: number
}

export interface ConstellationPickerProps {
    /** The tree flattened in display order (parents before children). */
    items: ConstellationPickerItem[]
    /** Ids that cannot be picked — e.g. a moving branch and its descendants. */
    exclude?: Iterable<string>
    onPick: (id: string) => void
    onClose?: () => void
    /** A first row above the hits, e.g. `{label: 'Make it a root'}`. Hidden while searching. */
    lead?: { label: string; onSelect: () => void }
    /** Offers “Create "<query>"” when no hit has exactly that name. */
    onCreate?: (name: string) => void
    /** Accessible name of the search field. */
    label?: string
}

const ROW_TEXT = {
    fontFamily: 'var(--font-text)',
    fontSize: 10.5,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
} as const

export function ConstellationPicker({
                                        items,
                                        exclude,
                                        onPick,
                                        onClose,
                                        lead,
                                        onCreate,
                                        label = 'Search the tree',
                                    }: ConstellationPickerProps) {
    const [query, setQuery] = useState('')
    const excluded = useMemo(() => new Set(exclude ?? []), [exclude])
    const needle = query.trim().replace(/\s+/g, ' ').toLowerCase()
    const hits = items.filter((item) => !excluded.has(item.id)
        && (!needle || [...item.path, item.name].some((name) => name.toLowerCase().includes(needle))))
    const canCreate = onCreate != null && needle !== '' && !items.some((item) => item.name.toLowerCase() === needle)
    const rows = [
        ...(lead && !needle ? [{key: 'lead', node: <span style={{...ROW_TEXT, color: 'var(--accent-2)'}}>{lead.label}</span>, onSelect: lead.onSelect}] : []),
        ...hits.map((item) => ({
            key: item.id,
            depth: item.depth,
            onSelect: () => onPick(item.id),
            node: <>
                <TagDot color={item.color} size={item.depth === 0 ? 8 : 6}/>
                <span style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3}}>
                    <span style={{
                        ...ROW_TEXT,
                        color: 'var(--cream)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>{item.name}</span>
                    {item.path.length > 0 && <span style={{
                        ...ROW_TEXT,
                        fontSize: 8.5,
                        letterSpacing: '1.4px',
                        color: 'var(--text-faint)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>{item.path.join(' › ')}</span>}
                </span>
                {item.count != null &&
                    <span style={{fontFamily: 'var(--font-text)', fontSize: 10, color: 'var(--text-faint)'}}>{item.count}</span>}
            </>,
        })),
        ...(canCreate ? [{
            key: 'create',
            node: <span style={{...ROW_TEXT, color: 'var(--accent-2)'}}>Create “{query.trim()}”</span>,
            onSelect: () => onCreate(query.trim().replace(/\s+/g, ' ')),
        }] : []),
    ]

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
            border: '1px solid var(--line-strong)',
        }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--line)'}}>
                <span style={{display: 'flex', paddingLeft: 11, color: 'var(--text-faint)'}}><Icon name="search" size={13}/></span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label}
                       aria-label={label} autoFocus
                       onKeyDown={(event) => {
                           if (event.key === 'Escape' && onClose) {
                               // The picker owns this Escape; a host panel must not close with it.
                               event.preventDefault()
                               event.stopPropagation()
                               onClose()
                           }
                       }}
                       style={{
                           flex: 1,
                           minWidth: 0,
                           minHeight: 44,
                           border: 'none',
                           background: 'transparent',
                           outline: 'none',
                           padding: '0 8px',
                           color: 'var(--cream)',
                           fontFamily: 'var(--font-text)',
                           fontSize: 12,
                           letterSpacing: '1px',
                       }}/>
                {onClose && <IconButton s={44} title="Close picker" onClick={onClose}><Icon name="close" size={13}/></IconButton>}
            </div>
            <div role="list" style={{maxHeight: 264, overflowY: 'auto'}}>
                {rows.map((row, index) => (
                    <div role="listitem" key={row.key}>
                        <button type="button" onClick={row.onSelect} style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 9,
                            minHeight: 44,
                            padding: `8px 11px 8px ${11 + ('depth' in row && row.depth ? row.depth * 12 : 0)}px`,
                            border: 0,
                            borderTop: index === 0 ? 'none' : '1px solid var(--line)',
                            background: 'transparent',
                            textAlign: 'left',
                            cursor: 'pointer',
                        }}>{row.node}</button>
                    </div>
                ))}
                {rows.length === 0 && <p style={{
                    margin: 0,
                    padding: '14px 11px',
                    fontFamily: 'var(--font-text)',
                    fontSize: 12,
                    color: 'var(--text-faint)',
                }}>Nothing in the tree matches.</p>}
            </div>
        </div>
    )
}
