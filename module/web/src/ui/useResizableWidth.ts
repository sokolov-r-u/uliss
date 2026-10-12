import type {KeyboardEvent, PointerEvent} from 'react'
import {useRef, useState} from 'react'

const STEP = 16

/**
 * Drag-to-resize for a rail with a handle on one edge. `edge` is the side the handle sits on: `right` for the left
 * sidebar (dragging right widens), `left` for the right panel (dragging left widens). Arrow keys move the edge by
 * 16px, Home/End jump to the limits; the width is stored per device under `storageKey`.
 */
export function useResizableWidth({storageKey, min, max, initial, edge, label}: {
    storageKey: string
    min: number
    max: number
    initial: number
    edge: 'left' | 'right'
    label: string
}) {
    const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)))
    const [width, setWidth] = useState(() => {
        try {
            const stored = Number(localStorage.getItem(storageKey))
            return Number.isFinite(stored) && stored > 0 ? clamp(stored) : initial
        } catch {
            return initial
        }
    })
    const dragRef = useRef<{ x: number; width: number } | null>(null)
    const sign = edge === 'right' ? 1 : -1

    const save = (value: number) => {
        try {
            localStorage.setItem(storageKey, String(value))
        } catch {
            // Private mode or blocked storage: the width just resets next visit.
        }
    }

    const resizeTo = (value: number) => {
        const next = clamp(value)
        setWidth(next)
        save(next)
    }

    const handleProps = {
        role: 'separator',
        'aria-orientation': 'vertical' as const,
        'aria-label': label,
        'aria-valuemin': min,
        'aria-valuemax': max,
        'aria-valuenow': width,
        tabIndex: 0,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault()
                resizeTo(width + (event.key === 'ArrowRight' ? STEP : -STEP) * sign)
            } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                resizeTo(event.key === 'Home' ? min : max)
            }
        },
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture?.(event.pointerId)
            dragRef.current = {x: event.clientX, width}
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => {
            const drag = dragRef.current
            if (drag) setWidth(clamp(drag.width + (event.clientX - drag.x) * sign))
        },
        onPointerUp: () => {
            if (!dragRef.current) return
            dragRef.current = null
            save(width)
        },
        onPointerCancel: () => {
            if (!dragRef.current) return
            dragRef.current = null
            save(width)
        },
    }

    return {width, handleProps}
}
