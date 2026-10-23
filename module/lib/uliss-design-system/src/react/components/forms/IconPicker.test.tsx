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
    skins: {} as Record<string, string[]>,
    tone: 0,
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
            return library.favorites.slice(0, limit).map((unicode) => ({
                unicode,
                annotation: `name of ${unicode}`,
                ...(library.skins[unicode]
                    ? {skins: library.skins[unicode].map((skin, index) => ({tone: index + 1, unicode: skin}))}
                    : {}),
            }))
        }

        async getPreferredSkinTone() {
            return library.tone
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
    library.skins = {}
    library.tone = 0
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

    it('in cover mode lies over the popover root, has its own title and closes with its close button', async () => {
        render(<div data-popover-root="" ref={(root) => {
            if (root) vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(
                {top: 100, bottom: 600, left: 40, right: 400, width: 360, height: 500, x: 40, y: 100} as DOMRect)
        }}>
            <IconPicker label="Icon" value="🎷" onChange={vi.fn()} dataSource={DATA} cover/>
        </div>)

        await userEvent.click(trigger())

        const dialog = screen.getByRole('dialog', {name: 'Choose an icon'})
        expect(dialog).toHaveStyle({position: 'fixed', top: '100px', left: '40px', width: '360px', height: '500px'})
        expect(screen.getByText('Choose an icon')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', {name: 'Close the picker'}))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(trigger()).toHaveFocus()
    })

    it('stays inside a short window, opening on the side with more room', async () => {
        const height = window.innerHeight
        window.innerHeight = 560
        try {
            render(<Dropdown/>)
            vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(
                {top: 230, bottom: 278, left: 20, right: 68, width: 48, height: 48, x: 20, y: 230} as DOMRect)

            await userEvent.click(trigger())

            const dialog = screen.getByRole('dialog', {name: 'Choose an icon'})
            const top = parseFloat(dialog.style.top)
            const box = dialog.firstElementChild?.firstElementChild as HTMLElement
            expect(top).toBeGreaterThanOrEqual(8)
            expect(top + parseFloat(box.style.height) + 18).toBeLessThanOrEqual(560 - 8)
        } finally {
            window.innerHeight = height
        }
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

    it('shows up to three rows of favorites above the picker and hides the single row of the library', async () => {
        library.favorites = Array.from({length: 25}, (_, index) => String.fromCodePoint(0x1F400 + index))
        render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)

        const favorites = await screen.findByRole('group', {name: 'Favorites'})

        expect(favorites.querySelectorAll('button')).toHaveLength(21)
        expect(screen.getByRole('button', {name: 'name of 🐀'})).toHaveTextContent('🐀')
        const style = document.querySelector('emoji-picker')?.shadowRoot?.querySelector('style')
        expect(style?.textContent).toMatch(/\.favorites\s*\{[^}]*display:\s*none/)
    })

    it('takes a favorite with the preferred skin tone and counts it as a pick of the user', async () => {
        library.favorites = ['👍']
        library.skins = {'👍': ['👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']}
        library.tone = 3
        const onPick = vi.fn()
        render(<EmojiPicker dataSource={DATA} onPick={onPick}/>)

        await userEvent.click(await screen.findByRole('button', {name: 'name of 👍'}))

        expect(onPick).toHaveBeenCalledWith('👍🏽')
        // the library never saw this click: both counts are ours
        expect(library.increments).toEqual(['👍', '👍'])
    })

    it('follows a skin tone chosen in the picker', async () => {
        library.favorites = ['👍']
        library.skins = {'👍': ['👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']}
        render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)
        const favorite = await screen.findByRole('button', {name: 'name of 👍'})
        expect(favorite).toHaveTextContent('👍')

        fireEvent(document.querySelector('emoji-picker')!, new CustomEvent('skin-tone-change', {detail: {skinTone: 5}}))

        await waitFor(() => expect(favorite).toHaveTextContent('👍🏿'))
    })

    it('fills its container when asked, keeping the three rows of favorites', async () => {
        const {container} = render(<EmojiPicker dataSource={DATA} onPick={vi.fn()} fill/>)

        await screen.findByRole('group', {name: 'Favorites'})

        expect(container.firstElementChild).toHaveStyle({height: '100%'})
    })

    it('keeps the same box while the picker loads and once it has loaded', async () => {
        const {container} = render(<EmojiPicker dataSource={DATA} onPick={vi.fn()}/>)
        const box = (container.firstElementChild as HTMLElement).getAttribute('style')

        await screen.findByRole('button', {name: 'thumbs up, medium skin tone'})

        await waitFor(() => expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBe(box))
    })
})
