import type {CSSProperties, ReactNode} from 'react'
import {useEffect, useState} from 'react'
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom'
import {Button, Icon, IconButton, Kicker, ListRow, NavRow, noteTitleText, StarMark, useLocale, useMessages, Wordmark} from '@uliss/design-system'
import {type Chat, chatActivity, listChats, subscribeToChatListChanges} from '../../chat/chatApi'
import {listNotes, type Note, noteChangedAt, subscribeToNotesChanges} from '../../notes/noteApi'
import {toNoteViewModels} from '../../notes/NotesPage'
import {ItemActions} from '../actions/ItemActions'
import {ListMore} from '../list/ListMore'
import {useKeysetList} from '../list/useKeysetList'
import {useResizableWidth} from '../useResizableWidth'
import {groupByRecency} from './recency'
import {pinnedChats as pinnedChatsStore, pinnedNotes as pinnedNotesStore, usePinnedChats, usePinnedNotes, withoutPinned} from '../pins/pinned'
import {PinnedFailed} from '../pins/PinnedFailed'
import {commonMessages} from '../../i18n/common.messages'
import {sideNavMessages} from './SideNav.messages'
import {recencyMessages} from './recency.messages'

/** The five destinations — this order, every breakpoint (see NavRow.prompt.md). */
const NAV_ITEMS: { to: string; label: 'chats' | 'notes' | 'constellations' | 'sky' | 'updates'; icon: ReactNode }[] = [
    {to: '/chats', label: 'chats', icon: <Icon name="node" size={16}/>},
    {to: '/notes', label: 'notes', icon: <Icon name="journal" size={16}/>},
    {to: '/constellations', label: 'constellations', icon: <Icon name="constellation" size={17}/>},
    {to: '/sky', label: 'sky', icon: <Icon name="star" size={16}/>},
    {to: '/updates', label: 'updates', icon: <Icon name="pulse" size={17}/>},
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
    const locale = useLocale()
    const t = useMessages(sideNavMessages)
    const common = useMessages(commonMessages)
    const groups = useMessages(recencyMessages)
    const recency = [groups.today, groups.yesterday, groups.thisWeek, groups.thisMonth, groups.earlier] as const
    const location = useLocation()
    const [chatsRevision, setChatsRevision] = useState(0)
    const [notesRevision, setNotesRevision] = useState(0)
    const [tab, setTab] = useState<ListTab>('chats')
    const {width, handleProps: resizeHandle} = useResizableWidth({
        storageKey: 'uliss.sidenav.width', min: 220, max: 420, initial: 264, edge: 'right', label: t.resize,
    })

    useEffect(() => subscribeToChatListChanges(() => setChatsRevision((value) => value + 1)), [])
    useEffect(() => subscribeToNotesChanges(() => setNotesRevision((value) => value + 1)), [])

    // Each list refetches only on its own event: a chat turn does not reload the notes.
    const chatList = useKeysetList(listChats, chatsRevision)
    const noteList = useKeysetList(listNotes, notesRevision)
    const pinnedChatsState = usePinnedChats()
    const pinnedNotesState = usePinnedNotes()
    const pinnedChats: Chat[] = pinnedChatsState.status === 'ready' ? pinnedChatsState.items : []
    const pinnedNotes: Note[] = pinnedNotesState.status === 'ready' ? pinnedNotesState.items : []
    // a pinned row lives only in its Pinned group, also while a page fetched before the pin is still shown
    const chats = withoutPinned(chatList.state.status === 'ready' ? chatList.state.items : [], pinnedChats)
    const notes = withoutPinned(noteList.state.status === 'ready' ? noteList.state.items : [], pinnedNotes)
    const states = [chatList.state.status, noteList.state.status, pinnedChatsState.status, pinnedNotesState.status]
    // a failed load is told apart from an empty account, and so is one still loading: "Nothing here yet" would be a lie
    const anyFailed = states.includes('error')
    const allSettled = !states.includes('loading')

    const retryLists = () => {
        setChatsRevision((value) => value + 1)
        setNotesRevision((value) => value + 1)
        pinnedChatsStore.refresh()
        pinnedNotesStore.refresh()
    }

    const go = (to: string) => () => {
        onClose()
        navigate(to)
    }

    const empty = chats.length === 0 && notes.length === 0 && pinnedChats.length === 0 && pinnedNotes.length === 0
    const noteViews = toNoteViewModels(notes, locale, noteChangedAt)
    // pinned rows come first, under their own label, and never again in the recency groups
    const chatGroups = [
        ...(pinnedChats.length > 0 ? [{label: common.pinned, items: pinnedChats}] : []),
        ...groupByRecency(chats, chatActivity, undefined, recency),
    ]
    const pinnedNoteViews = toNoteViewModels(pinnedNotes, locale, noteChangedAt)
    const noteGroups = [
        ...(pinnedNotes.length > 0
            ? [{label: common.pinned, items: pinnedNotes.map((note, index) => ({note, view: pinnedNoteViews[index]}))}]
            : []),
        ...groupByRecency(notes.map((note, index) => ({note, view: noteViews[index]})), ({view}) => view.listedAt, undefined, recency),
    ]

    return (
        <>
            {open && <button type="button" className="nav-backdrop" aria-label={t.closeNavigation} onClick={onClose}/>}
            <aside id="app-navigation" aria-label={t.primaryNavigation}
                   style={{'--side-nav-width': `${width}px`} as CSSProperties}
                   className={`side-nav${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
                <div className="side-nav-top">
                    <div className="side-nav-head">
                        <span className="side-nav-wordmark"><Wordmark size={24}/></span>
                        <span className="side-nav-mobile-close"><IconButton s={44} title={t.closeNavigation}
                                                                            onClick={onClose}><Icon name="close"
                                                                                                    size={17}/></IconButton></span>
                        <IconButton s={30} title={common.search} onClick={go('/search')}><Icon name="search"
                                                                                        size={16}/></IconButton>
                        <span className="side-nav-collapse">
                            <IconButton s={30} title={collapsed ? t.expand : t.collapse}
                                        onClick={onToggleCollapsed}><Icon name="collapse" size={16}/></IconButton>
                        </span>
                    </div>

                    <NavLink to="/chats/new" onClick={onClose} className="side-nav-new">
                        <span className="side-nav-new-icon"><Icon name="plus" size={15}/></span>
                        <span className="side-nav-new-label">{t.newChat}</span>
                    </NavLink>

                    <nav className="side-nav-links">
                        {NAV_ITEMS.map(({to, label, icon}) => (
                            <NavLink key={to} to={to} onClick={onClose} className="side-nav-link">
                                {({isActive}) => <NavRow icon={icon} label={common[label]} active={isActive}/>}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="side-nav-body">
                    {empty && anyFailed ? (
                        <div className="side-nav-empty" role="alert">
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">{t.couldNotLoad}</Kicker>
                            <p className="side-nav-body-note">{t.couldNotLoadBody}</p>
                            <Button size="sm" variant="quiet" onClick={retryLists}>{common.retry}</Button>
                        </div>
                    ) : empty && allSettled ? (
                        <div className="side-nav-empty">
                            <Kicker size={9} spacing="2.5px" color="var(--text-faint)">{t.empty}</Kicker>
                            <p className="side-nav-body-note">{t.emptyBody}</p>
                        </div>
                    ) : (
                        <>
                            <div className="side-nav-tabs" role="tablist" aria-label={t.tabs}
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
                                        {common[id]}
                                    </button>
                                ))}
                            </div>
                            <div className="side-nav-list" role="tabpanel"
                                 aria-label={tab === 'chats' ? t.recentChats : t.recentNotes}>
                                {tab === 'chats' && pinnedChatsState.status === 'error' &&
                                    <PinnedFailed announce={false} onRetry={pinnedChatsStore.refresh}/>}
                                {tab === 'notes' && pinnedNotesState.status === 'error' &&
                                    <PinnedFailed announce={false} onRetry={pinnedNotesStore.refresh}/>}
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
                                                                        menuLabel={common.actionsFor(chat.title)}/>}
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
                                                         onRenamed={(title) => noteList.update((current) => ({
                                                             ...current,
                                                             items: current.items.map((item) => item.id === note.id ? {...item, title} : item),
                                                         }))}
                                                         onDeleted={() => {
                                                             noteList.update((current) => ({
                                                                 ...current,
                                                                 items: current.items.filter((item) => item.id !== note.id),
                                                                 total: current.total === undefined ? undefined : Math.max(0, current.total - 1),
                                                             }))
                                                             if (location.pathname === `/notes/${note.id}`) {
                                                                 navigate('/notes', {replace: true})
                                                             }
                                                         }}>
                                                {(openMenu) => <ListRow title={view.title} icon={view.icon ?? null}
                                                                        onClick={go(`/notes/${note.id}`)}
                                                                        onMenu={openMenu}
                                                                        menuLabel={common.actionsFor(noteTitleText(view.title, view.icon))}/>}
                                            </ItemActions>
                                        ))}
                                    </div>
                                ))}
                                {tab === 'chats' && chatList.state.status === 'ready' &&
                                    <ListMore hasMore={chatList.state.hasMore} state={chatList.state.more}
                                              onMore={chatList.loadMore}/>}
                                {tab === 'notes' && noteList.state.status === 'ready' &&
                                    <ListMore hasMore={noteList.state.hasMore} state={noteList.state.more}
                                              onMore={noteList.loadMore}/>}
                                <Link to={tab === 'chats' ? '/chats' : '/notes'} onClick={onClose}
                                      className="side-nav-all">{t.viewAll}</Link>
                            </div>
                        </>
                    )}
                </div>

                <div className="side-nav-foot">
                    <span className="side-nav-avatar"><StarMark size={15} glow={false}/></span>
                    <span className="side-nav-count">{common.noteCount(noteList.state.status === 'ready' ? noteList.state.total ?? notes.length : 0)}</span>
                    <IconButton s={26} title={common.settings} onClick={go('/settings')}><Icon name="gear"
                                                                                        size={15}/></IconButton>
                </div>

                <div className="side-nav-resize" {...resizeHandle}/>
            </aside>
        </>
    )
}
