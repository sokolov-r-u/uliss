import type {KeyboardEvent} from 'react'

const STEP: Record<string, (columns: number) => number> = {
    ArrowRight: () => 1,
    ArrowLeft: () => -1,
    ArrowDown: (columns) => columns,
    ArrowUp: (columns) => -columns,
}

/**
 * Arrow-key move within a group of `count` items laid out in `columns` (Home/End to the ends). Returns the new index,
 * or null for any other key; the caller selects it, and the item at that index in `group` gets focus on the next
 * frame (the element is taken now: React clears `currentTarget` after the handler).
 */
export function arrowFocus(
    event: KeyboardEvent<HTMLElement>,
    group: HTMLElement | null,
    index: number,
    count: number,
    columns = count,
): number | null {
    if (count === 0) return null
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? count - 1
            : STEP[event.key] ? ((index + STEP[event.key](columns)) % count + count) % count
                : null
    if (next === null) return null
    event.preventDefault()
    requestAnimationFrame(() => (group?.querySelectorAll<HTMLElement>('[role="radio"], button')[next])?.focus())
    return next
}
