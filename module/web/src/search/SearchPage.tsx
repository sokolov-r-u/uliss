import {useState} from 'react'
import {EmptyState, Icon, Kicker, NoteTitle, useMessages} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import type {SearchViewModel} from '../views/models'
import {ScreenHeader} from '../ui/ScreenHeader'
import {searchMessages} from './search.messages'

export function SearchView({query, model, onQueryChange, onOpenNote, onOpenChat, onSearchChats}: {
    query: string
    model: SearchViewModel
    onQueryChange: (query: string) => void
    onOpenNote?: (id: string) => void
    onOpenChat?: (id: string) => void
    onSearchChats?: () => void
}) {
    const t = useMessages(searchMessages)
    const q = query.trim()
    return <div className="product-view search-view">
        <ScreenHeader><label className="search-field">
            <span className="search-field-icon"><Icon name="search" size={14}/></span>
            <input className="search-input" type="search" autoFocus placeholder={t.placeholder}
                   value={query} onChange={(event) => onQueryChange(event.target.value)}/>
            {query && <button type="button" className="search-clear" onClick={() => onQueryChange('')}><Kicker size={9}
                                                                                                               spacing="2px"
                                                                                                               color="var(--text-faint)">{t.clear}</Kicker>
            </button>}
        </label></ScreenHeader>
        <div className="product-body">
        {!q || model.notes.length + model.chats.length === 0 ? <div className="product-empty">
            <EmptyState title={q ? t.noMatch(q) : t.placeholder}
                        body={q ? t.noMatchBody : t.emptyBody}
                        action={q ? t.searchChats : undefined} onAction={q ? onSearchChats : undefined}/>
        </div> : <div className="search-results">
            <div className="product-section-head"><Kicker size={9} spacing="3px"
                                                          color="var(--accent)">{t.notes}</Kicker><span>{t.shown(model.notes.length, model.totalNotes)}</span>
            </div>
            {model.notes.map((note) => <button className="search-result" type="button" key={note.id}
                                               onClick={() => onOpenNote?.(note.id)}>
                <span className="search-result-line"><strong><NoteTitle title={note.title} icon={note.icon ?? null} slot/></strong><span><Icon name="star"
                                                                                              size={11}/>{note.linkCount} · {note.date}</span></span>
                <span className="search-result-excerpt">{note.excerpt}</span>
            </button>)}
            {model.chats.length > 0 && <div className="product-section-head secondary"><Kicker size={9} spacing="3px"
                                                                                               color="var(--text-faint)">{t.alsoInChats}</Kicker><span>{model.chats.length}</span></div>}
            {model.chats.map((chat) => <button className="search-chat-result" type="button" key={chat.id}
                                               onClick={() => onOpenChat?.(chat.id)}><Icon name="noteDoc"
                                                                                           size={12}/><span>{chat.title}</span><small>{chat.date}</small>
            </button>)}
        </div>}
        </div>
    </div>
}

/** Production adapter: no search endpoint exists; queries deliberately receive empty collections. */
export function SearchPage() {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    return <SearchView query={query} onQueryChange={setQuery} model={{totalNotes: 0, notes: [], chats: []}}
                       onSearchChats={() => navigate('/chats')}/>
}
