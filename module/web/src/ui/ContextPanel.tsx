import {type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState} from 'react'
import {Icon, IconButton, Kicker} from '@uliss/design-system'
import {useResizableWidth} from './useResizableWidth'

/**
 * Open/closed state of the details panel. It starts open from the 768px breakpoint, where it is a rail beside the
 * content, and closed on the phone, where it would cover it — a JS media check because CSS cannot pick the initial
 * state of the toggle.
 */
export function usePanelOpen(): [boolean, () => void, () => void] {
    const [open, setOpen] = useState(() => typeof window.matchMedia === 'function'
        && window.matchMedia('(min-width: 768px)').matches)
    const toggle = useCallback(() => setOpen((value) => !value), [])
    const close = useCallback(() => setOpen(false), [])
    return [open, toggle, close]
}

/**
 * The right-hand panel of an open chat or note (kit "This note" / "Notes from this chat"): a rail beside the content
 * from 768px (drag its left edge to resize, 260–480px), a right drawer over it on the phone. Only shows what the
 * backend provides: dates, counts, and the chat ↔ note links (`ui/links`).
 */
export function ContextPanel({label, open, onClose, children}: {
    label: string
    open: boolean
    onClose: () => void
    children: ReactNode
}) {
    const {width, handleProps} = useResizableWidth({
        storageKey: 'uliss.context-panel.width', min: 260, max: 480, initial: 300, edge: 'left', label: 'Resize panel',
    })

    const panelRef = useRef<HTMLElement>(null)
    const backdropRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!open) return
        const onKeyDown = (event: KeyboardEvent) => {
            // A dialog or menu on top owns Escape.
            if (event.key !== 'Escape' || document.querySelector('[role="dialog"], [role="menu"]')) return
            // The phone drawer (scrim shown) always closes; the wide rail only when focus is inside it, so Escape in
            // the composer or elsewhere leaves it open.
            const backdrop = backdropRef.current
            const drawer = backdrop != null && getComputedStyle(backdrop).display !== 'none'
            if (drawer || panelRef.current?.contains(document.activeElement)) onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, onClose])

    if (!open) return null
    return (
        <>
            <button ref={backdropRef} type="button" className="context-backdrop" tabIndex={-1} aria-hidden="true"
                    onClick={onClose}/>
            <aside ref={panelRef} className="context-panel" aria-label={label}
                   style={{'--context-panel-width': `${width}px`} as CSSProperties}>
                <div className="context-panel-resize" {...handleProps}/>
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
