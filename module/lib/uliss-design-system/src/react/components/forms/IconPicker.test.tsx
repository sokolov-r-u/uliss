import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {IconPicker} from './IconPicker'
import {EmojiPicker} from './EmojiPicker'
import {STARTER_EMOJI} from './emojiFavorites'

// The library touches IndexedDB and draws into a shadow root; jsdom has neither, so both modules are fakes that keep
// the contract the components rely on: a `Database` with favorites and an `<emoji-picker>` firing `emoji-click`.
const library = vi.hoisted(() => ({
    favorites: [] as string[],
    increments: [] as string[],
    readyFails: false,
    readyGate: null as Promise<void> | null,
    closed: 0,
    pickers: [] as { dataSource?: string; locale?: string }[],
}))

vi.mock('emoji-picker-element/database.js', () => ({
    default: class {
        async ready() {
            if (library.readyGate) await library.readyGate
            if (library.readyFails) throw new Error('IndexedDB is blocked')
        }

        async close() {
            library.closed += 1
        }

        async getTopFavoriteEmoji(limit: number) {
            return library.favorites.slice(0, limit).map((unicode) => ({unicode}))
        }

        async incrementFavoriteEmojiCount(unicode: string) {
            library.increments.push(unicode)
        }
    },
}))

vi.mock('emoji-picker-element/picker.js', () => {
    class FakePicker extends HTMLElement {
        constructor(options: { dataSource?: string; locale?: string } = {}) {
            super()
            this.attachShadow({mode: 'open'})
            library.pickers.push(options)
        }

        connectedCallback() {
            const pick = document.createElement('button')
            pick.textContent = 'thumbs up, medium skin tone'
            pick.addEventListener('click', () => this.dispatchEvent(new CustomEvent('emoji-click', {
                detail: {unicode: '👍🏽', skinTone: 3, emoji: {unicode: '👍', annotation: 'thumbs up'}},
            })))
            this.append(pick)
        }
    }

    if (!customElements.get('emoji-picker')) customElements.define('emoji-picker', FakePicker)
    return {default: FakePicker}
})

beforeEach(() => {
    library.favorites = ['🦊']
    library.increments = []
    library.readyFails = false
    library.readyGate = null
    library.closed = 0
    library.pickers = []
})

const DATA = '/emoji/en/data.json'

function Dropdown({initial = null}: { initial?: string | null }) {
    const [icon, setIcon] = useState<string | null>(initial)
    return <>
        <IconPicker label="Icon" value={icon} onChange={setIcon} dataSource={DATA}/>
        <output aria-label="Chosen">{icon ?? 'none'}</output>
        <button type="button">Elsewhere</button>
    </>
}

const trigger = () => screen.getByRole('button', {name: /^Icon:/})
const pickEmoji = async () => userEvent.click(await screen.findByRole('button', {name: 'thumbs up, medium skin tone'}))

describe('IconPicker', () => {
    it('opens the emoji picker on our own data and takes the picked emoji with its skin tone', async () => {
        render(<Dropdown/>)
        expect(trigger()).toHaveAccessibleName('Icon: none')
        expect(trigger()).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(trigger())
        expect(screen.getByRole('dialog', {name: 'Choose an icon'})).toBeInTheDocument()
        await pickEmoji()

        expect(screen.getByLabelText('Chosen')).toHaveTextContent('👍🏽')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(trigger()).toHaveAccessibleName('Icon: 👍🏽')
        expect(trigger()).toHaveFocus()
        expect(library.pickers).toEqual([{dataSource: DATA, locale: 'en'}])
    })

    it('counts a pick once more than the library does, so it outranks the starter favorites', async () => {
        render(<Dropdown/>)

        await userEvent.click(trigger())
        await pickEmoji()

        // the library counts the click itself; the extra count goes to the base emoji, as the library keys it
        expect(library.increments).toEqual(['👍'])
    })

    it('removes the icon', async () => {
        render(<Dropdown initial="🎷"/>)

        await userEvent.click(trigger())
        await userEvent.click(screen.getByRole('button', {name: 'Remove the icon'}))

        expect(screen.getByLabelText('Chosen')).toHaveTextContent('none')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(trigger()).toHaveFocus()
    })

    it('offers no removal while there is no icon', async () => {
        render(<Dropdown/>)

        await userEvent.click(trigger())

        expect(screen.queryByRole('button', {name: 'Remove the icon'})).not.toBeInTheDocument()
    })

    it('closes on Escape without a change and keeps the key from a host dialog', async () => {
        const reached = vi.fn()
        document.addEventListener('keydown', (event) => reached(event.defaultPrevented), {once: true})
        render(<Dropdown initial="🎷"/>)

        await userEvent.click(trigger())
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'})

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Chosen')).toHaveTextContent('🎷')
        expect(reached).toHaveBeenCalledWith(true)
        expect(trigger()).toHaveFocus()
    })

    it('closes on a click outside without a change', async () => {
        render(<Dropdown initial="🎷"/>)

        await userEvent.click(trigger())
        await userEvent.click(screen.getByRole('button', {name: 'Elsewhere'}))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Chosen')).toHaveTextContent('🎷')
    })

    it('a second click on the button closes the picker', async () => {
        render(<Dropdown/>)

        await userEvent.click(trigger())
        await userEvent.click(trigger())

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens over the nearest popover root, so a dialog card neither clips nor grows', async () => {
        render(<div data-popover-root="">
            <div style={{overflow: 'hidden'}}><Dropdown/></div>
        </div>)

        await userEvent.click(trigger())

        const dialog = screen.getByRole('dialog', {name: 'Choose an icon'})
        expect(dialog.parentElement).toHaveAttribute('data-popover-root')
        expect(dialog).toHaveStyle({position: 'fixed'})
        await pickEmoji()
        expect(screen.getByLabelText('Chosen')).toHaveTextContent('👍🏽')
    })

    it('opens over the page when there is no popover root and a click inside keeps it open', async () => {
        render(<Dropdown/>)

        await userEvent.click(trigger())
        const dialog = screen.getByRole('dialog', {name: 'Choose an icon'})
        expect(dialog.parentElement).toBe(document.body)
        fireEvent.pointerDown(dialog)

        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not open while disabled', async () => {
        render(<IconPicker label="Icon" value={null} onChange={vi.fn()} dataSource={DATA} disabled/>)

        await userEvent.click(trigger())

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})

describe('EmojiPicker', () => {
    it('seeds the starter favorites of a browser without any before the picker loads them', async () => {
        library.favorites = []
        render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)

        await screen.findByRole('button', {name: 'thumbs up, medium skin tone'})

        expect(library.increments).toEqual(STARTER_EMOJI)
    })

    it('leaves the favorites alone once the browser has some', async () => {
        render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)

        await screen.findByRole('button', {name: 'thumbs up, medium skin tone'})

        expect(library.increments).toEqual([])
    })

    it('still opens when the browser storage is blocked', async () => {
        library.readyFails = true
        const onPick = vi.fn()
        render(<EmojiPicker dataSource={DATA} onPick={onPick}/>)

        await pickEmoji()

        expect(onPick).toHaveBeenCalledWith('👍🏽')
    })

    it('closes its database when it goes away before the picker was created', async () => {
        let open = () => undefined as void
        library.readyGate = new Promise<void>((resolve) => {
            open = resolve
        })
        const {unmount} = render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)
        await waitFor(() => expect(library.readyGate).not.toBeNull())

        unmount()
        open()

        await waitFor(() => expect(library.closed).toBe(1))
        expect(library.pickers).toEqual([])
    })

    it('shows the favorites above the emoji grid', async () => {
        render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)

        await screen.findByRole('button', {name: 'thumbs up, medium skin tone'})

        const style = document.querySelector('emoji-picker')?.shadowRoot?.querySelector('style')
        expect(style?.textContent).toMatch(/\.favorites\s*\{[^}]*order:\s*1/)
        expect(style?.textContent).toMatch(/\.tabpanel\s*\{[^}]*order:\s*2/)
    })

    it('keeps the same box while the picker loads and once it has loaded', async () => {
        const {container} = render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)
        const box = (container.firstElementChild as HTMLElement).getAttribute('style')

        await screen.findByRole('button', {name: 'thumbs up, medium skin tone'})

        await waitFor(() => expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBe(box))
    })
})
