import {useState} from 'react'
import {EmptyState, Icon, Kicker} from '@uliss/design-system'
import {useNavigate} from 'react-router-dom'
import type {SearchViewModel} from '../views/models'

export function SearchView({query, model, onQueryChange, onOpenNote, onOpenChat, onSearchChats}: {
    query: string
    model: SearchViewModel
    onQueryChange: (query: string) => void
    onOpenNote?: (id: string) => void
    onOpenChat?: (id: string) => void
    onSearchChats?: () => void
}) {
    const q = query.trim()
    return <div className="product-view search-view">
        <header className="search-header"><label className="search-field">
            <span className="search-field-icon"><Icon name="search" size={14}/></span>
            <input className="search-input" type="search" autoFocus placeholder="Search your notes and chats"
                   value={query} onChange={(event) => onQueryChange(event.target.value)}/>
            {query && <button type="button" className="search-clear" onClick={() => onQueryChange('')}><Kicker size={9}
                                                                                                               spacing="2px"
                                                                                                               color="var(--text-faint)">Clear</Kicker>
            </button>}
        </label></header>
        {!q || model.notes.length + model.chats.length === 0 ? <div className="product-empty">
            <EmptyState title={q ? `No notes match “${q}”` : 'Search your notes and chats'}
                        body={q ? 'Uliss searches note titles and text. Try a shorter word, or look through your chats instead.' : 'Type a word or two. Uliss looks through note titles, note text, and your conversations.'}
                        action={q ? 'Search chats' : undefined} onAction={q ? onSearchChats : undefined}/>
        </div> : <div className="search-results">
            <div className="product-section-head"><Kicker size={9} spacing="3px"
                                                          color="var(--accent)">Notes</Kicker><span>{model.notes.length} of {model.totalNotes}</span>
            </div>
            {model.notes.map((note) => <button className="search-result" type="button" key={note.id}
                                               onClick={() => onOpenNote?.(note.id)}>
                <span className="search-result-line"><strong>{note.title}</strong><span><Icon name="star"
                                                                                              size={11}/>{note.linkCount} · {note.date}</span></span>
                <span className="search-result-excerpt">{note.excerpt}</span>
            </button>)}
            {model.chats.length > 0 && <div className="product-section-head secondary"><Kicker size={9} spacing="3px"
                                                                                               color="var(--text-faint)">Also
                in chats</Kicker><span>{model.chats.length}</span></div>}
            {model.chats.map((chat) => <button className="search-chat-result" type="button" key={chat.id}
                                               onClick={() => onOpenChat?.(chat.id)}><Icon name="noteDoc"
                                                                                           size={12}/><span>{chat.title}</span><small>{chat.date}</small>
            </button>)}
        </div>}
    </div>
}

/** Production adapter: no search endpoint exists; queries deliberately receive empty collections. */
export function SearchPage() {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    return <SearchView query={query} onQueryChange={setQuery} model={{totalNotes: 0, notes: [], chats: []}}
                       onSearchChats={() => navigate('/chats')}/>
}
