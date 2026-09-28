import {act, fireEvent, render} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import type {DisplayMessage} from './Bubble'
import {MessageThread} from './MessageThread'

const message = (id: string, content = id): DisplayMessage => ({
    id,
    content,
    role: 'ASSISTANT',
    status: 'COMPLETE',
})

function setDimensions(element: HTMLElement, scrollHeight: number, clientHeight = 200) {
    Object.defineProperties(element, {
        scrollHeight: {configurable: true, value: scrollHeight},
        clientHeight: {configurable: true, value: clientHeight},
    })
}

describe('MessageThread', () => {
    it('requests an older page once the user reaches the top threshold', () => {
        const onLoadOlder = vi.fn()
        const view = render(<MessageThread messages={[message('m-1')]} hasMore
                                           isLoadingOlder={false} onLoadOlder={onLoadOlder}/>)
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 48

        fireEvent.scroll(thread)

        expect(onLoadOlder).toHaveBeenCalledOnce()
    })

    it('does not request another page while an older request is active', () => {
        const onLoadOlder = vi.fn()
        const view = render(<MessageThread messages={[message('m-1')]} hasMore
                                           isLoadingOlder onLoadOlder={onLoadOlder}/>)
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        thread.scrollTop = 0

        fireEvent.scroll(thread)

        expect(onLoadOlder).not.toHaveBeenCalled()
    })

    it('preserves the visible anchor when older messages are prepended', () => {
        function Harness() {
            const [messages, setMessages] = useState([message('m-2'), message('m-3')])
            return <>
                <button onClick={() => setMessages([message('m-0'), message('m-1'), ...messages])}>prepend</button>
                <MessageThread messages={messages} hasMore={false} isLoadingOlder={false}
                               onLoadOlder={() => undefined}/>
            </>
        }

        const view = render(<Harness/>)
        const thread = view.container.querySelector('.message-thread') as HTMLDivElement
        setDimensions(thread, 400)
        thread.scrollTop = 60
        fireEvent.scroll(thread)
        setDimensions(thread, 700)

        act(() => view.getByRole('button', {name: 'prepend'}).click())

        expect(thread.scrollTop).toBe(360)
    })

    it('auto-scrolls initial and appended tail content to the bottom', () => {
        function Harness() {
            const [messages, setMessages] = useState([message('m-1')])
            return <>
                <button onClick={() => setMessages([...messages, message('m-2')])}>append</button>
                <MessageThread messages={messages} hasMore={false} isLoadingOlder={false}
                               onLoadOlder={() => undefined}/>
            </>
        }

        const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {configurable: true, get: () => 400})
        try {
            const view = render(<Harness/>)
            const thread = view.container.querySelector('.message-thread') as HTMLDivElement
            expect(thread.scrollTop).toBe(400)
            Object.defineProperty(thread, 'scrollHeight', {configurable: true, value: 650})

            act(() => view.getByRole('button', {name: 'append'}).click())

            expect(thread.scrollTop).toBe(650)
        } finally {
            if (originalScrollHeight) {
                Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
            } else {
                delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight
            }
        }
    })
})
