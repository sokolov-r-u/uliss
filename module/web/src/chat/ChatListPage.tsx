/** Post-login landing page: the user's chats (`GET /note/chats`) with a "new chat" action. */
import {useEffect, useState} from 'react'
import {describeError} from '../lib/apiHelpers'
import {useNavigate} from 'react-router-dom'
import {Button, EmptyState, Icon, Kicker, ListRow, useLocale, useMessages} from '@uliss/design-system'
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
import {commonMessages} from '../i18n/common.messages'
import {chatMessages} from './chat.messages'

export function ChatListPage() {
    const navigate = useNavigate()
    const locale = useLocale()
    const t = useMessages(chatMessages)
    const common = useMessages(commonMessages)
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
                kicker={common.chats}
                right={
                    <Button variant="quiet" size="sm" onClick={onNewChat}>
                        {t.newChat}
                    </Button>
                }
            />

            <div className="product-body">
                {state.status === 'loading' && <p className="chat-state">{common.loading}</p>}
                {state.status === 'error' && <p className="chat-state chat-state-error">{describeError(state.error, locale)}</p>}

                {state.status === 'ready' && pinnedState.status === 'error' && <PinnedFailed onRetry={pinnedChats.refresh}/>}

                {state.status === 'ready' && pinnedState.status === 'loading' && items.length === 0 &&
                    <p className="chat-state">{common.loading}</p>}

                {state.status === 'ready' && pinnedState.status === 'ready' && items.length === 0 && pinned.length === 0 && <div className="product-empty">
                    <EmptyState
                        title={t.noChats}
                        body={t.noChatsBody}
                        action={t.startChat}
                        onAction={onNewChat}
                    />
                </div>}

                {state.status === 'ready' && (items.length > 0 || pinned.length > 0) && (
                    <div className="product-list">
                        {[
                            // pinned chats come first under their own label; the pages leave them out
                            ...(pinned.length > 0 ? [{label: common.pinned, items: pinned}] : []),
                            ...groupByMonth(items, chatActivity, locale),
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
                                    date={formatShortDate(chatActivity(chat), locale)}
                                    meta={<><Icon name="noteDoc" size={12}/>{chat.noteCount}</>}
                                    onClick={() => navigate(`/chats/${chat.id}`)}
                                    onMenu={openMenu}
                                    menuLabel={common.actionsFor(chat.title)}/>}
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
