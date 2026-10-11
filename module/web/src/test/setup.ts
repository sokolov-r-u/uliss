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

// Node's own (flag-gated) global `localStorage` shadows jsdom's and is undefined without --localstorage-file.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
    const store = new Map<string, string>()
    const memoryStorage: Storage = {
        get length() {
            return store.size
        },
        clear: () => store.clear(),
        getItem: (key) => store.get(key) ?? null,
        key: (index) => Array.from(store.keys())[index] ?? null,
        removeItem: (key) => void store.delete(key),
        setItem: (key, value) => void store.set(key, String(value)),
    }
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: memoryStorage})
}
