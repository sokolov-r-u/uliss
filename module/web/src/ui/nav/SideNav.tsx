import type {CSSProperties, ReactNode} from 'react'
import {useEffect, useState} from 'react'
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom'
import {Button, Icon, IconButton, Kicker, ListRow, NavRow, noteTitleText, StarMark, Wordmark} from '@uliss/design-system'
import {type Chat, chatActivity, listChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {listNotes, type Note, subscribeToNotesChanges} from '../../notes/noteApi'
import {toNoteViewModels} from '../../notes/NotesPage'
import {ItemActions} from '../actions/ItemActions'
import {useResizableWidth} from '../useResizableWidth'
import {groupByRecency} from './recency'
import {noteCountLabel} from '../format'

/** The five destinations — this order, every breakpoint (see NavRow.prompt.md). */
const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
    {to: '/chats', label: 'Chats', icon: <Icon name="node" size={16}/>},
    {to: '/notes', label: 'Notes', icon: <Icon name="journal" size={16}/>},
    {to: '/constellations', label: 'Constellations', icon: <Icon name="constellation" size={17}/>},
    {to: '/sky', label: 'Sky', icon: <Icon name="star" size={16}/>},
    {to: '/updates', label: 'Updates', icon: <Icon name="pulse" size={17}/>},
]

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
    const [chatsRevision, setChatsRevision] = useState(0)
    const [notesRevision, setNotesRevision] = useState(0)
    const [tab, setTab] = useState<ListTab>('chats')
    const {width, handleProps: resizeHandle} = useResizableWidth({
        storageKey: 'uliss.sidenav.width', min: 220, max: 420, initial: 264, edge: 'right', label: 'Resize sidebar',
    })

    useEffect(() => subscribeToChatListChanges(() => setChatsRevision((value) => value + 1)), [])
    useEffect(() => subscribeToNotesChanges(() => setNotesRevision((value) => value + 1)), [])

    // a failed load is told apart from an empty account: "Nothing here yet" would be a lie
    const [chatsFailed, setChatsFailed] = useState(false)
    const [notesFailed, setNotesFailed] = useState(false)

    // Each list refetches only on its own event: a chat turn does not reload the notes.
    useEffect(() => {
        let active = true
        listChats().then((items) => {
            if (!active) return
            setChats(items)
            setChatsFailed(false)
        }).catch(() => {
            if (active) setChatsFailed(true)
        })
        return () => {
            active = false
        }
    }, [chatsRevision])

    useEffect(() => {
        let active = true
        listNotes().then((items) => {
            if (!active) return
            setNotes(items)
            setNotesFailed(false)
        }).catch(() => {
            if (active) setNotesFailed(true)
        })
        return () => {
            active = false
        }
    }, [notesRevision])

    const retryLists = () => {
        setChatsRevision((value) => value + 1)
        setNotesRevision((value) => value + 1)
    }

    const go = (to: string) => () => {
        onClose()
        navigate(to)
    }

    const empty = chats.length === 0 && notes.length === 0
    const noteViews = toNoteViewModels(notes)
    const chatGroups = groupByRecency(chats, chatActivity)
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
                    {empty && (chatsFailed || notesFailed) ? (
                        <div className="side-nav-empty" role="alert">
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">Could not load</Kicker>
                            <p className="side-nav-body-note">Your chats and notes did not load. Check the connection.</p>
                            <Button size="sm" variant="quiet" onClick={retryLists}>Retry</Button>
                        </div>
                    ) : empty ? (
                        <div className="side-nav-empty">
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">Nothing here yet</Kicker>
                            <p className="side-nav-body-note">Chats and notes will collect here as you talk.</p>
                        </div>
                    ) : (
                        <>
                            <div className="side-nav-tabs" role="tablist" aria-label="Side panel list"
                                 onKeyDown={(event) => {
                                     // tabs pattern: arrows switch, the selected tab is the only tab stop
                                     if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                                     event.preventDefault()
                                     const next: ListTab = tab === 'chats' ? 'notes' : 'chats'
                                     setTab(next)
                                     const group = event.currentTarget
                                     requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus())
                                 }}>
                                {(['chats', 'notes'] as ListTab[]).map((id) => (
                                    <button key={id} type="button" role="tab" aria-selected={tab === id}
                                            data-tab={id} tabIndex={tab === id ? 0 : -1}
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
                                            <ItemActions key={chat.id} dialogHost="nav"
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
                                                         target={{kind: 'note', id: note.id, title: view.title, icon: view.icon,
                                                             renamable: note.status === 'READY'}}
                                                         onRenamed={(title) => setNotes((current) =>
                                                             current.map((item) => item.id === note.id ? {...item, title} : item))}
                                                         onDeleted={() => {
                                                             setNotes((current) => current.filter((item) => item.id !== note.id))
                                                             if (location.pathname === `/notes/${note.id}`) {
                                                                 navigate('/notes', {replace: true})
                                                             }
                                                         }}>
                                                {(openMenu) => <ListRow title={view.title} icon={view.icon ?? null}
                                                                        onClick={go(`/notes/${note.id}`)}
                                                                        onMenu={openMenu}
                                                                        menuLabel={`Actions for ${noteTitleText(view.title, view.icon)}`}/>}
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

                <div className="side-nav-resize" {...resizeHandle}/>
            </aside>
        </>
    )
}
