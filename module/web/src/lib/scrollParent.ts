/** The nearest ancestor that scrolls vertically, or the document's scrolling element. */
export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement ?? null; node !== null; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return node
    }
    return document.scrollingElement as HTMLElement | null
}
