import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {EmptyState, Icon, Kicker} from '@uliss/design-system'

/**
 * Search — reads note titles / text and chats. There is no search backend yet, so a query
 * always lands on the "no match" empty state; an empty field shows a neutral prompt. Reached
 * from the SideNav search icon (`/search`).
 */
export function SearchPage() {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const q = query.trim()

    return (
        <div className="screen">
            <header className="search-header">
                <label className="search-field">
                    <span className="search-field-icon"><Icon name="search" size={14}/></span>
                    <input
                        className="search-input"
                        type="text"
                        autoFocus
                        placeholder="Search your notes and chats"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                        <button type="button" className="search-clear" onClick={() => setQuery('')}>
                            <Kicker size={9} spacing="2px" color="var(--text-faint)">Clear</Kicker>
                        </button>
                    )}
                </label>
            </header>
            <div className="screen-body">
                <div className="screen-empty">
                    {q ? (
                        <EmptyState
                            title={`No notes match “${q}”`}
                            body="Uliss searches note titles and text. Try a shorter word, or look through your chats instead."
                            action="Search chats"
                            onAction={() => navigate('/chats')}
                        />
                    ) : (
                        <EmptyState
                            title="Search your notes and chats"
                            body="Type a word or two. Uliss looks through note titles, note text, and your conversations."
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
