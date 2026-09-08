import {useState} from 'react'
import {Button, EmptyState, Icon, Kicker} from '@uliss/design-system'
import type {UpdateDecisionViewModel, UpdateViewModel} from '../views/models'

type Filter = 'all' | UpdateViewModel['category']

export function UpdatesView({updates, decisions, onDecide, onUndo}: {
    updates: UpdateViewModel[]
    decisions: UpdateDecisionViewModel[]
    onDecide?: (id: string, accept: boolean) => void
    onUndo?: (id: string) => void
}) {
    const [filter, setFilter] = useState<Filter>('all')
    const [decisionIndex, setDecisionIndex] = useState(0)
    const [stopped, setStopped] = useState(false)
    const decision = stopped ? null : decisions[decisionIndex] ?? null
    const visible = filter === 'all' ? updates : updates.filter((update) => update.category === filter)
    const decide = (accept: boolean) => {
        if (!decision) return
        onDecide?.(decision.id, accept)
        setDecisionIndex((index) => index + 1)
    }

    if (updates.length === 0 && decisions.length === 0) return <div className="product-view product-empty"><EmptyState
        title="Nothing to report yet"
        body="This is where Uliss records what it does on its own — links it draws, notes it writes, patterns it spots. It fills in as you talk."/>
    </div>

    return <div className="product-view updates-view">
        {decision && <section className="decision-queue" aria-label="Decisions">
            <header><Kicker size={9} spacing="2.5px" color="var(--accent)">To
                decide</Kicker><span>{decisionIndex + 1} of {decisions.length}</span></header>
            <h2>{decision.title}</h2><p>{decision.detail}</p>
            <div className="decision-actions"><Button
                onClick={() => decide(true)}>{decision.confirmLabel}</Button><Button variant="quiet"
                                                                                     onClick={() => decide(false)}>Not
                now</Button><Button variant="ghost" onClick={() => setStopped(true)}>Stop for now</Button></div>
        </section>}
        <div className="update-filters" role="radiogroup" aria-label="Update filter">
            {(['all', 'link', 'note', 'pattern'] as Filter[]).map((id) => <button key={id} type="button" role="radio"
                                                                                  aria-checked={filter === id}
                                                                                  onClick={() => setFilter(id)}>{id === 'all' ? 'All' : id === 'link' ? 'Links' : id === 'note' ? 'Writing' : 'Noticed'}</button>)}
        </div>
        <div className="update-log">
            {visible.map((update) => <article key={update.id}
                                              className={update.pending ? 'update-row pending' : 'update-row'}>
                <span className="update-icon"><Icon
                    name={update.category === 'link' ? 'star' : update.category === 'note' ? 'noteDoc' : 'pulse'}
                    size={13}/></span>
                <div><h3>{update.title}</h3><p>{update.detail}</p><small>{update.date}</small></div>
                {update.undoable && <Button variant="ghost" onClick={() => onUndo?.(update.id)}>Undo</Button>}
            </article>)}
            {visible.length === 0 && <p className="product-muted">No updates in this filter.</p>}
        </div>
    </div>
}

/** Production adapter: no updates contract exists, so the log and decision queue are empty. */
export function UpdatesPage() {
    return <UpdatesView updates={[]} decisions={[]}/>
}
