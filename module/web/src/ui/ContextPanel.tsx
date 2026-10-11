import {type ReactNode, useEffect} from 'react'
import {Icon, IconButton, Kicker} from '@uliss/design-system'

/** Absolute date with the year — 'Jun 22, 2026'. Empty when unknown. */
export function formatPanelDate(iso?: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
}

/**
 * The right-hand panel of an open chat or note (kit "This note" / "Notes from this chat"): a rail beside the content
 * from 768px, a right drawer over it on the phone. Only shows what the backend provides; link lists wait for the
 * note-service API (see TECH_DEBT).
 */
export function ContextPanel({label, open, onClose, children}: {
    label: string
    open: boolean
    onClose: () => void
    children: ReactNode
}) {
    useEffect(() => {
        if (!open) return
        const onKeyDown = (event: KeyboardEvent) => {
            // A dialog or menu on top owns Escape.
            if (event.key !== 'Escape' || document.querySelector('[role="dialog"], [role="menu"]')) return
            onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, onClose])

    if (!open) return null
    return (
        <>
            <button type="button" className="context-backdrop" tabIndex={-1} aria-hidden="true" onClick={onClose}/>
            <aside className="context-panel" aria-label={label}>
                <header className="context-panel-head">
                    <Kicker size={9.5} spacing="2.5px" color="var(--text-faint)">{label}</Kicker>
                    <IconButton s={30} title="Close panel" onClick={onClose}><Icon name="close" size={14}/></IconButton>
                </header>
                <div className="context-panel-body">{children}</div>
            </aside>
        </>
    )
}

export function PanelSection({label, count, children}: { label: string; count?: number; children: ReactNode }) {
    return (
        <section className="context-section">
            <div className="context-section-head">
                <Kicker size={9} spacing="2.5px" color="var(--cream-dim)">{label}</Kicker>
                {count != null && <span className="context-section-count">{count}</span>}
            </div>
            {children}
        </section>
    )
}

/** One 'Written · Jun 22, 2026' line inside a section. */
export function PanelFact({label, value}: { label: string; value: ReactNode }) {
    return (
        <p className="context-fact">
            <span className="context-fact-label">{label}</span>
            <span className="context-fact-value">{value}</span>
        </p>
    )
}

/** The header toggle that opens and closes the panel. */
export function PanelToggle({label, open, onToggle}: { label: string; open: boolean; onToggle: () => void }) {
    return (
        <IconButton s={44} title={label} aria-pressed={open} onClick={onToggle}
                    color={open ? 'var(--accent-2)' : 'var(--cream-dim)'}>
            <Icon name="panelRight" size={17}/>
        </IconButton>
    )
}
