/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useState} from 'react'
import {describeError} from '../lib/apiHelpers'
import {useNavigate} from 'react-router-dom'
import {Button, EmptyState, Icon, Kicker, ListRow} from '@uliss/design-system'
import {ItemActions} from '../ui/actions/ItemActions'
import {ListMore} from '../ui/list/ListMore'
import {useKeysetList} from '../ui/list/useKeysetList'
import {groupByMonth} from '../ui/nav/recency'
import {ScreenHeader} from '../ui/ScreenHeader'
import {type Chat, chatActivity, listChats, subscribeToChatListChanges} from './chatApi'
import {pinnedChats, usePinnedChats, withoutPinned} from '../ui/pins/pinned'
import {PinnedFailed} from '../ui/pins/PinnedFailed'
import './chat.css'
import {formatShortDate} from '../ui/format'

export function ChatListPage() {
    const navigate = useNavigate()
    const [revision, setRevision] = useState(0)
    // A refresh after rename/delete keeps the current rows; a failed one keeps them until the next list change.
    const {state, loadMore} = useKeysetList(listChats, revision)

    useEffect(() => subscribeToChatListChanges(() => setRevision((value) => value + 1)), [])
    const pinnedState = usePinnedChats()
    const pinned: Chat[] = pinnedState.status === 'ready' ? pinnedState.items : []
    // a pinned chat lives only in the Pinned group, also while a page fetched before the pin is still shown
    const items = state.status === 'ready' ? withoutPinned(state.items, pinned) : []

    function onNewChat() {
        navigate('/chats/new')
    }

    return (
        <div className="product-view">
            <ScreenHeader
                kicker="Chats"
                right={
                    <Button variant="quiet" size="sm" onClick={onNewChat}>
                        New chat
                    </Button>
                }
            />

            <div className="product-body">
                {state.status === 'loading' && <p className="chat-state">Loading…</p>}
                {state.status === 'error' && <p className="chat-state chat-state-error">{describeError(state.error)}</p>}

                {state.status === 'ready' && pinnedState.status === 'error' && <PinnedFailed onRetry={pinnedChats.refresh}/>}

                {state.status === 'ready' && pinnedState.status === 'loading' && items.length === 0 &&
                    <p className="chat-state">Loading…</p>}

                {state.status === 'ready' && pinnedState.status === 'ready' && items.length === 0 && pinned.length === 0 && <div className="product-empty">
                    <EmptyState
                        title="No chats yet"
                        body="Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping."
                        action="Start a chat"
                        onAction={onNewChat}
                    />
                </div>}

                {state.status === 'ready' && (items.length > 0 || pinned.length > 0) && (
                    <div className="product-list">
                        {[
                            // pinned chats come first under their own label; the pages leave them out
                            ...(pinned.length > 0 ? [{label: 'Pinned', items: pinned}] : []),
                            ...groupByMonth(items, chatActivity),
                        ].map((group, groupIndex) => <div
                            key={`${group.label}-${groupIndex}`} className="list-group">
                            {group.label && <div className="list-month"><Kicker size={8.5} spacing="3px"
                                                                                color="var(--text-faint)">{group.label}</Kicker></div>}
                        {group.items.map((chat, index) => (
                            <ItemActions key={chat.id} dialogHost="list"
                                         target={{
                                             kind: 'chat',
                                             id: chat.id,
                                             title: chat.title,
                                             noteCount: chat.noteCount
                                         }}>
                                {(openMenu) => <ListRow
                                    title={chat.title}
                                    first={index === 0}
                                    date={formatShortDate(chatActivity(chat))}
                                    meta={<><Icon name="noteDoc" size={12}/>{chat.noteCount}</>}
                                    onClick={() => navigate(`/chats/${chat.id}`)}
                                    onMenu={openMenu}
                                    menuLabel={`Actions for ${chat.title}`}/>}
                            </ItemActions>
                        ))}
                        </div>)}
                        <ListMore hasMore={state.hasMore} state={state.more} onMore={loadMore}/>
                    </div>
                )}
            </div>
        </div>
    )
}
