import {type RefObject, useEffect, useLayoutEffect, useRef} from 'react'

const FOCUSABLE = [
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    'a[href]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface FocusTrapOptions {
    /** Called on Escape; absent means Escape does nothing (a blocking step). */
    onEscape?: () => void
}

/**
 * Keeps keyboard focus inside `ref` while mounted: on the next frame, unless an element inside already took focus
 * (React `autoFocus`), focuses its `[autofocus]` element or first focusable; wraps Tab and Shift+Tab, and returns focus to the previously focused element on unmount. Escape calls
 * `onEscape` unless an inner control already handled it (`defaultPrevented`, e.g. an open Select).
 *
 * The effect runs once per mount: `onEscape` is read through a ref, so a parent passing a new arrow function on every
 * render does not move focus.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, {onEscape}: FocusTrapOptions = {}) {
    const onEscapeRef = useRef(onEscape)
    useLayoutEffect(() => {
        onEscapeRef.current = onEscape
    })

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        // an inert part (a step drawn over another) cannot take focus
        const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
            .filter((element) => !element.closest('[inert]'))
        const frame = requestAnimationFrame(() => {
            // React's `autoFocus` focuses on mount without rendering the attribute: keep that focus
            if (ref.current?.contains(document.activeElement)) return
            const autoFocus = ref.current?.querySelector<HTMLElement>('[autofocus]')
            ;(autoFocus ?? focusable()[0])?.focus()
        })
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (event.defaultPrevented || !onEscapeRef.current) return
                event.preventDefault()
                onEscapeRef.current()
                return
            }
            if (event.key !== 'Tab') return
            const items = focusable()
            if (items.length === 0) {
                event.preventDefault()
                return
            }
            const first = items[0]
            const last = items[items.length - 1]
            // a focus lost to the page (its element removed or made inert) comes back to the trap
            if (!ref.current?.contains(document.activeElement)) {
                event.preventDefault()
                first.focus()
                return
            }
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('keydown', onKeyDown)
            previous?.focus()
        }
    }, [ref])
}
