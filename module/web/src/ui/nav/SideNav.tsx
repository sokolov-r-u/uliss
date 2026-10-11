import type {CSSProperties, KeyboardEvent, PointerEvent, ReactNode} from 'react'
import {useEffect, useRef, useState} from 'react'
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom'
import {Icon, IconButton, Kicker, ListRow, NavRow, StarMark, Wordmark} from '@uliss/design-system'
import {type Chat, listChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {listNotes, type Note} from '../../notes/noteApi'
import {toNoteViewModels} from '../../notes/NotesPage'
import {ItemActions} from '../actions/ItemActions'
import {groupByRecency} from './recency'

/** The five destinations — this order, every breakpoint (see NavRow.prompt.md). */
const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
    {to: '/chats', label: 'Chats', icon: <Icon name="node" size={16}/>},
    {to: '/notes', label: 'Notes', icon: <Icon name="journal" size={16}/>},
    {to: '/constellations', label: 'Constellations', icon: <Icon name="constellation" size={17}/>},
    {to: '/sky', label: 'Sky', icon: <Icon name="star" size={16}/>},
    {to: '/updates', label: 'Updates', icon: <Icon name="pulse" size={17}/>},
]

const WIDTH_KEY = 'uliss.sidenav.width'
const WIDTH_MIN = 220
const WIDTH_MAX = 420
const WIDTH_DEFAULT = 264
const WIDTH_STEP = 16

const clampWidth = (value: number) => Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(value)))

function readWidth(): number {
    try {
        const stored = Number(localStorage.getItem(WIDTH_KEY))
        return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : WIDTH_DEFAULT
    } catch {
        return WIDTH_DEFAULT
    }
}

function saveWidth(value: number) {
    try {
        localStorage.setItem(WIDTH_KEY, String(value))
    } catch {
        // Private mode or blocked storage: the width just resets next visit.
    }
}

function noteCountLabel(count: number): string {
    if (count === 0) return 'No notes yet'
    return count === 1 ? '1 note' : `${count} notes`
}

type ListTab = 'chats' | 'notes'

/**
 * Single responsive nav: a mobile overlay drawer (`open` toggles a CSS transform) that becomes a rail at 768px and
 * the full, drag-resizable sidebar at 1024px (see `AppShell.css`). The body switches between the user's chats and
 * notes, grouped by recency; day one says plainly that nothing is here yet.
 */
export function SideNav({open, collapsed, onClose, onToggleCollapsed}: {
    open: boolean
    collapsed: boolean
    onClose: () => void
    onToggleCollapsed: () => void
}) {
    const navigate = useNavigate()
    const location = useLocation()
    const [chats, setChats] = useState<Chat[]>([])
    const [notes, setNotes] = useState<Note[]>([])
    const [revision, setRevision] = useState(0)
    const [tab, setTab] = useState<ListTab>('chats')
    const [width, setWidth] = useState(readWidth)
    const dragRef = useRef<{ x: number; width: number } | null>(null)

    useEffect(() => subscribeToChatListChanges(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        let active = true
        listChats().then((items) => {
            if (active) setChats(items)
        }).catch(() => undefined)
        listNotes().then((items) => {
            if (active) setNotes(items)
        }).catch(() => undefined)
        return () => {
            active = false
        }
    }, [revision])

    const go = (to: string) => () => {
        onClose()
        navigate(to)
    }

    const resizeTo = (value: number) => {
        const next = clampWidth(value)
        setWidth(next)
        saveWidth(next)
    }

    const onResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            resizeTo(width + (event.key === 'ArrowRight' ? WIDTH_STEP : -WIDTH_STEP))
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            resizeTo(event.key === 'Home' ? WIDTH_MIN : WIDTH_MAX)
        }
    }

    const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        dragRef.current = {x: event.clientX, width}
    }
    const onResizeMove = (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (drag) setWidth(clampWidth(drag.width + event.clientX - drag.x))
    }
    const onResizeEnd = () => {
        if (!dragRef.current) return
        dragRef.current = null
        saveWidth(width)
    }

    const empty = chats.length === 0 && notes.length === 0
    const noteViews = toNoteViewModels(notes)
    const chatGroups = groupByRecency(chats, (chat) => chat.updatedAt ?? chat.createdAt)
    const noteGroups = groupByRecency(notes.map((note, index) => ({note, view: noteViews[index]})),
        ({note}) => note.createdAt)

    return (
        <>
            {open && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={onClose}/>}
            <aside id="app-navigation" aria-label="Primary navigation"
                   style={{'--side-nav-width': `${width}px`} as CSSProperties}
                   className={`side-nav${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
                <div className="side-nav-top">
                    <div className="side-nav-head">
                        <span className="side-nav-wordmark"><Wordmark size={24}/></span>
                        <span className="side-nav-mobile-close"><IconButton s={44} title="Close navigation"
                                                                            onClick={onClose}><Icon name="close"
                                                                                                    size={17}/></IconButton></span>
                        <IconButton s={30} title="Search" onClick={go('/search')}><Icon name="search"
                                                                                        size={16}/></IconButton>
                        <span className="side-nav-collapse">
                            <IconButton s={30} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                                        onClick={onToggleCollapsed}><Icon name="collapse" size={16}/></IconButton>
                        </span>
                    </div>

                    <NavLink to="/chats/new" onClick={onClose} className="side-nav-new">
                        <span className="side-nav-new-icon"><Icon name="plus" size={15}/></span>
                        <span className="side-nav-new-label">New</span>
                    </NavLink>

                    <nav className="side-nav-links">
                        {NAV_ITEMS.map(({to, label, icon}) => (
                            <NavLink key={to} to={to} onClick={onClose} className="side-nav-link">
                                {({isActive}) => <NavRow icon={icon} label={label} active={isActive}/>}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="side-nav-body">
                    {empty ? (
                        <div className="side-nav-empty">
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">Nothing here yet</Kicker>
                            <p className="side-nav-body-note">Chats and notes will collect here as you talk.</p>
                        </div>
                    ) : (
                        <>
                            <div className="side-nav-tabs" role="tablist" aria-label="Side panel list">
                                {(['chats', 'notes'] as ListTab[]).map((id) => (
                                    <button key={id} type="button" role="tab" aria-selected={tab === id}
                                            className="side-nav-tab" onClick={() => setTab(id)}>
                                        {id === 'chats' ? 'Chats' : 'Notes'}
                                    </button>
                                ))}
                            </div>
                            <div className="side-nav-list" role="tabpanel"
                                 aria-label={tab === 'chats' ? 'Recent chats' : 'Recent notes'}>
                                {tab === 'chats' && chatGroups.map((group) => (
                                    <div key={group.label} className="side-nav-group">
                                        <Kicker size={8.5} spacing="2.5px" color="var(--text-faint)">{group.label}</Kicker>
                                        {group.items.map((chat) => (
                                            <ItemActions key={chat.id}
                                                         target={{kind: 'chat', id: chat.id, title: chat.title, noteCount: chat.noteCount}}
                                                         onDeleted={() => {
                                                             if (location.pathname === `/chats/${chat.id}`) {
                                                                 navigate('/chats', {replace: true})
                                                             }
                                                         }}>
                                                {(openMenu) => <ListRow title={chat.title} onClick={go(`/chats/${chat.id}`)}
                                                                        onMenu={openMenu}
                                                                        menuLabel={`Actions for ${chat.title}`}/>}
                                            </ItemActions>
                                        ))}
                                    </div>
                                ))}
                                {tab === 'notes' && noteGroups.map((group) => (
                                    <div key={group.label} className="side-nav-group">
                                        <Kicker size={8.5} spacing="2.5px" color="var(--text-faint)">{group.label}</Kicker>
                                        {group.items.map(({note, view}) => (
                                            <ItemActions key={note.id}
                                                         target={{kind: 'note', id: note.id, title: view.title,
                                                             renamable: note.status === 'READY'}}
                                                         onRenamed={(title) => setNotes((current) =>
                                                             current.map((item) => item.id === note.id ? {...item, title} : item))}
                                                         onDeleted={() => {
                                                             setNotes((current) => current.filter((item) => item.id !== note.id))
                                                             if (location.pathname === `/notes/${note.id}`) {
                                                                 navigate('/notes', {replace: true})
                                                             }
                                                         }}>
                                                {(openMenu) => <ListRow title={view.title} onClick={go(`/notes/${note.id}`)}
                                                                        onMenu={openMenu}
                                                                        menuLabel={`Actions for ${view.title}`}/>}
                                            </ItemActions>
                                        ))}
                                    </div>
                                ))}
                                <Link to={tab === 'chats' ? '/chats' : '/notes'} onClick={onClose}
                                      className="side-nav-all">View all →</Link>
                            </div>
                        </>
                    )}
                </div>

                <div className="side-nav-foot">
                    <span className="side-nav-avatar"><StarMark size={15} glow={false}/></span>
                    <span className="side-nav-count">{noteCountLabel(notes.length)}</span>
                    <IconButton s={26} title="Settings" onClick={go('/settings')}><Icon name="gear"
                                                                                        size={15}/></IconButton>
                </div>

                <div className="side-nav-resize" role="separator" aria-orientation="vertical"
                     aria-label="Resize sidebar" aria-valuemin={WIDTH_MIN} aria-valuemax={WIDTH_MAX}
                     aria-valuenow={width} tabIndex={0} onKeyDown={onResizeKey}
                     onPointerDown={onResizeStart} onPointerMove={onResizeMove}
                     onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd}/>
            </aside>
        </>
    )
}
