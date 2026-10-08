import '@testing-library/jest-dom/vitest'
import {cleanup} from '@testing-library/react'
import {afterEach} from 'vitest'

afterEach(cleanup)

if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0)
}

// jsdom has no PointerEvent; without it fireEvent drops pointerType.
if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
        readonly pointerType: string

        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init)
            this.pointerType = init.pointerType ?? ''
        }
    }

    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent
}
