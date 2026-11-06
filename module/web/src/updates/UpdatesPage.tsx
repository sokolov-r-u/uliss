import {useState} from 'react'
import {Button, EmptyState, Icon, Kicker, useMessages} from '@uliss/design-system'
import type {UpdateDecisionViewModel, UpdateViewModel} from '../views/models'
import {ScreenHeader} from '../ui/ScreenHeader'
import {commonMessages} from '../i18n/common.messages'
import {updatesMessages} from './updates.messages'

type Filter = 'all' | UpdateViewModel['category']

export function UpdatesView({updates, decisions, onDecide, onUndo}: {
    updates: UpdateViewModel[]
    decisions: UpdateDecisionViewModel[]
    onDecide?: (id: string, accept: boolean) => void
    onUndo?: (id: string) => void
}) {
    const t = useMessages(updatesMessages)
    const common = useMessages(commonMessages)
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

    const header = <ScreenHeader kicker={common.updates}/>
    if (updates.length === 0 && decisions.length === 0) return <div className="product-view">{header}
        <div className="product-body"><div className="product-empty"><EmptyState
        title={t.empty} body={t.emptyBody}/>
        </div></div>
    </div>

    return <div className="product-view">{header}
        <div className="updates-view">
        {decision && <section className="decision-queue" aria-label={t.decisions}>
            <header><Kicker size={9} spacing="2.5px" color="var(--accent)">{t.toDecide}</Kicker><span>{t.position(decisionIndex + 1, decisions.length)}</span></header>
            <h2>{decision.title}</h2><p>{decision.detail}</p>
            <div className="decision-actions"><Button
                onClick={() => decide(true)}>{decision.confirmLabel}</Button><Button variant="quiet"
                                                                                     onClick={() => decide(false)}>{t.notNow}</Button><Button variant="ghost" onClick={() => setStopped(true)}>{t.stop}</Button></div>
        </section>}
        <div className="update-filters" role="radiogroup" aria-label={t.filter}>
            {(['all', 'link', 'note', 'pattern'] as Filter[]).map((id) => <button key={id} type="button" role="radio"
                                                                                  aria-checked={filter === id}
                                                                                  onClick={() => setFilter(id)}>{t[id]}</button>)}
        </div>
        <div className="update-log">
            {visible.map((update) => <article key={update.id}
                                              className={update.pending ? 'update-row pending' : 'update-row'}>
                <span className="update-icon"><Icon
                    name={update.category === 'link' ? 'star' : update.category === 'note' ? 'noteDoc' : 'pulse'}
                    size={13}/></span>
                <div><h3>{update.title}</h3><p>{update.detail}</p><small>{update.date}</small></div>
                {update.undoable && <Button variant="ghost" onClick={() => onUndo?.(update.id)}>{t.undo}</Button>}
            </article>)}
            {visible.length === 0 && <p className="product-muted">{t.none}</p>}
        </div>
    </div></div>
}

/** Production adapter: no updates contract exists, so the log and decision queue are empty. */
export function UpdatesPage() {
    return <UpdatesView updates={[]} decisions={[]}/>
}
