import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ListMore} from './ListMore'

let report: ((visible: boolean) => void) | undefined
const disconnect = vi.fn()

beforeEach(() => {
    report = undefined
    disconnect.mockReset()
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: IntersectionObserverCallback) {
            report = (visible) => callback([{isIntersecting: visible} as IntersectionObserverEntry], this as never)
        }

        observe() {
        }

        disconnect = disconnect
    })
})

afterEach(() => vi.unstubAllGlobals())

describe('ListMore', () => {
    it('asks for the next page when it scrolls into view', () => {
        const onMore = vi.fn()
        render(<ListMore hasMore state="idle" onMore={onMore}/>)

        report?.(false)
        expect(onMore).not.toHaveBeenCalled()
        report?.(true)
        expect(onMore).toHaveBeenCalledOnce()
    })

    it('does not watch while a page is loading and says so', () => {
        render(<ListMore hasMore state="loading" onMore={vi.fn()}/>)

        expect(report).toBeUndefined()
        expect(screen.getByText('Loading…')).toBeInTheDocument()
    })

    it('offers Retry after a failed page instead of retrying on its own', async () => {
        const onMore = vi.fn()
        render(<ListMore hasMore state="failed" onMore={onMore}/>)

        expect(report).toBeUndefined()
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load more.')
        await userEvent.click(screen.getByRole('button', {name: 'Retry'}))
        expect(onMore).toHaveBeenCalledOnce()
    })

    it('renders nothing at the end of the list', () => {
        const {container} = render(<ListMore hasMore={false} state="idle" onMore={vi.fn()}/>)

        expect(container).toBeEmptyDOMElement()
        expect(report).toBeUndefined()
    })

    it('stops watching once it leaves the idle state', () => {
        const {rerender} = render(<ListMore hasMore state="idle" onMore={vi.fn()}/>)

        rerender(<ListMore hasMore state="loading" onMore={vi.fn()}/>)

        expect(disconnect).toHaveBeenCalled()
    })
})
