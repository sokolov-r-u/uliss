import {act, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {NoteApiError, type NotePoster, removeNotePoster, setNotePoster} from '../noteApi'
import {NotePosterSection} from './NotePosterSection'

vi.mock('../noteApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../noteApi')>()
    return {...actual, setNotePoster: vi.fn(), removeNotePoster: vi.fn()}
})

const mockedSet = vi.mocked(setNotePoster)
const mockedRemove = vi.mocked(removeNotePoster)

const LINK = 'https://www.acmodasi.in/amdb/images/movie/d/i/tokyo-story-1953-109623.jpg'

/** The images the section asks the browser to load; a test decides how each ends. */
class FakeImage {
    static made: FakeImage[] = []
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    src = ''
    referrerPolicy = ''
    decoding = ''
    naturalWidth = 0
    naturalHeight = 0

    constructor() {
        FakeImage.made.push(this)
    }

    /** A probe given up on stops its download. */
    removeAttribute(name: string) {
        if (name === 'src') this.cancelled = true
    }

    cancelled = false

    load(width: number, height: number) {
        this.naturalWidth = width
        this.naturalHeight = height
        act(() => this.onload?.())
    }

    fail() {
        act(() => this.onerror?.())
    }
}

async function probed(src: string): Promise<FakeImage> {
    let image: FakeImage | undefined
    await waitFor(() => {
        image = FakeImage.made.find((made) => made.src === src)
        expect(image).toBeDefined()
    })
    return image!
}

/** The panel's owner: it keeps the note and shows it with the poster the section reports. */
function Owner({initial, onChanged}: { initial?: NotePoster; onChanged: (poster: NotePoster | undefined) => void }) {
    const [poster, setPoster] = useState(initial)
    return <NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', poster}} onChanged={(next) => {
        onChanged(next)
        setPoster(next)
    }}/>
}

function renderSection(posterUrl?: string, onChanged = vi.fn()) {
    render(<Owner initial={posterUrl ? {url: posterUrl} : undefined} onChanged={onChanged}/>)
    return onChanged
}

describe('NotePosterSection', () => {
    beforeEach(() => {
        FakeImage.made = []
        vi.stubGlobal('Image', FakeImage)
        window.localStorage.clear()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('adds a poster: the whole pasted link, a preview measured by the browser, then Save', async () => {
        const user = userEvent.setup()
        mockedSet.mockResolvedValue({id: 'note-1', source: 'MANUAL', status: 'READY', content: 'x', poster: {url: LINK}})
        const onChanged = renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        const field = screen.getByRole('textbox', {name: 'Image link'})
        await user.click(field)
        await user.paste(LINK)
        expect(field).toHaveValue(LINK)
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()

        const image = await probed(LINK)
        expect(image.referrerPolicy).toBe('no-referrer')
        image.load(1200, 1800)
        expect(screen.getByRole('status')).toHaveTextContent('1200 × 1800 px — shown exactly like this')

        await user.click(screen.getByRole('button', {name: 'Save'}))

        expect(mockedSet).toHaveBeenCalledWith('note-1', LINK, undefined)
        await waitFor(() => expect(onChanged).toHaveBeenCalledWith({url: LINK}))
        expect(screen.getByRole('img', {name: 'Tokyo Story poster'})).toHaveAttribute('src', LINK)
        expect(screen.getByRole('button', {name: 'Change poster'})).toBeInTheDocument()
    })

    it('refuses a link that is not https without loading it', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        await user.type(screen.getByRole('textbox', {name: 'Image link'}), 'http://example.com/p.jpg')

        expect(screen.getByRole('alert')).toHaveTextContent('Only https:// links')
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
        expect(FakeImage.made).toHaveLength(0)
    })

    it('stops loading a link the user has moved on from', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        const field = screen.getByRole('textbox', {name: 'Image link'})
        await user.click(field)
        await user.paste('https://example.com/first.jpg')
        const first = await probed('https://example.com/first.jpg')
        await user.clear(field)
        await user.paste('https://example.com/second.jpg')
        await probed('https://example.com/second.jpg')

        expect(first.cancelled).toBe(true)
    })

    it('keeps Save off for an image under 300 px and says its size', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        await user.click(screen.getByRole('textbox', {name: 'Image link'}))
        await user.paste('https://example.com/thumb.jpg')
        ;(await probed('https://example.com/thumb.jpg')).load(120, 180)

        expect(screen.getByRole('alert')).toHaveTextContent('Too small: 120 × 180 px, needs at least 300 px')
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
    })

    it('says so when the link does not load as an image', async () => {
        const user = userEvent.setup()
        renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        await user.click(screen.getByRole('textbox', {name: 'Image link'}))
        await user.paste('https://example.com/article')
        ;(await probed('https://example.com/article')).fail()

        expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the image')
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
    })

    it('keeps the link and offers Save again when saving fails', async () => {
        const user = userEvent.setup()
        mockedSet.mockRejectedValue(new NoteApiError('http', 'note poster save failed', 500))
        const onChanged = renderSection()

        await user.click(screen.getByRole('button', {name: 'Add poster'}))
        await user.click(screen.getByRole('textbox', {name: 'Image link'}))
        await user.paste(LINK)
        ;(await probed(LINK)).load(600, 900)
        await user.click(screen.getByRole('button', {name: 'Save'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the poster. Try again.')
        expect(screen.getByRole('textbox', {name: 'Image link'})).toHaveValue(LINK)
        expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled()
        expect(onChanged).not.toHaveBeenCalled()
    })

    it('edits a saved poster under it with its link filled in, and Cancel changes nothing', async () => {
        const user = userEvent.setup()
        renderSection(LINK)

        await user.click(screen.getByRole('button', {name: 'Change poster'}))

        expect(screen.getByRole('textbox', {name: 'Image link'})).toHaveValue(LINK)
        expect(screen.queryByRole('button', {name: 'Change poster'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Cancel'}))
        expect(screen.getByRole('img', {name: 'Tokyo Story poster'})).toHaveAttribute('src', LINK)
        expect(mockedSet).not.toHaveBeenCalled()
    })

    it('removes the poster only after the confirmation', async () => {
        const user = userEvent.setup()
        mockedRemove.mockResolvedValue()
        const onChanged = renderSection(LINK)

        await user.click(screen.getByRole('button', {name: 'Remove poster'}))
        const dialog = screen.getByRole('dialog', {name: 'Remove the poster?'})
        await user.click(within(dialog).getByRole('button', {name: 'Remove'}))

        expect(mockedRemove).toHaveBeenCalledWith('note-1')
        await waitFor(() => expect(onChanged).toHaveBeenCalledWith(undefined))
        expect(screen.getByRole('button', {name: 'Add poster'})).toBeInTheDocument()
    })

    it('keeps the poster and says so when the removal fails', async () => {
        const user = userEvent.setup()
        mockedRemove.mockRejectedValue(new NoteApiError('http', 'note poster removal failed', 500))
        const onChanged = renderSection(LINK)

        await user.click(screen.getByRole('button', {name: 'Remove poster'}))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Remove'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t remove the poster. Try again.')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('img', {name: 'Tokyo Story poster'})).toHaveAttribute('src', LINK)
        expect(onChanged).not.toHaveBeenCalled()
    })

    it('shows the poster of the note it is given when the note is read again', () => {
        const {rerender} = render(<NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', poster: {url: LINK}}}
                                                     onChanged={vi.fn()}/>)

        rerender(<NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', poster: {url: 'https://example.com/new.jpg'}}}
                                    onChanged={vi.fn()}/>)
        expect(screen.getByRole('img', {name: 'Tokyo Story poster'})).toHaveAttribute('src', 'https://example.com/new.jpg')

        rerender(<NotePosterSection note={{id: 'note-1', title: 'Tokyo Story'}} onChanged={vi.fn()}/>)
        expect(screen.getByRole('button', {name: 'Add poster'})).toBeInTheDocument()
    })

    it('keeps the poster when the removal is cancelled', async () => {
        const user = userEvent.setup()
        renderSection(LINK)

        await user.click(screen.getByRole('button', {name: 'Remove poster'}))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Keep'}))

        expect(mockedRemove).not.toHaveBeenCalled()
        expect(screen.getByRole('img', {name: 'Tokyo Story poster'})).toBeInTheDocument()
    })

    it('shows a saved poster that stopped loading as unavailable, with its host', async () => {
        renderSection(LINK)

        act(() => {
            screen.getByRole('img', {name: 'Tokyo Story poster'}).dispatchEvent(new Event('error'))
        })

        expect(screen.getByText('Image unavailable')).toBeInTheDocument()
        expect(screen.getByText('www.acmodasi.in')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Change poster'})).toBeInTheDocument()
    })

    it('stays collapsed for the next note once collapsed', async () => {
        const user = userEvent.setup()
        const {unmount} = render(<NotePosterSection note={{id: 'note-1', poster: {url: LINK}}} onChanged={vi.fn()}/>)

        await user.click(screen.getByRole('button', {name: 'Poster'}))
        expect(screen.queryByRole('button', {name: 'Change poster'})).not.toBeInTheDocument()
        unmount()
        render(<NotePosterSection note={{id: 'note-2'}} onChanged={vi.fn()}/>)

        expect(screen.getByRole('button', {name: 'Poster'})).toHaveAttribute('aria-expanded', 'false')
    })
    describe('cropping', () => {
        const CROP = {poster: {x: 0.1, y: 0, w: 0.4, h: 1}, avatar: {x: 0.3, y: 0.1, w: 0.5, h: 0.833333}}

        async function openCrop(user: ReturnType<typeof userEvent.setup>, width = 1000, height = 600) {
            await user.click(screen.getByRole('button', {name: 'Crop poster'}))
            const dialog = screen.getByRole('dialog', {name: 'Crop poster'})
            expect(within(dialog).getByRole('button', {name: 'Save'})).toBeDisabled()
            ;(await probed(LINK)).load(width, height)
            return dialog
        }

        it('saves both frames with the link, cannot be closed meanwhile, and shows the panel by the frame', async () => {
            const user = userEvent.setup()
            let answer: (note: Awaited<ReturnType<typeof setNotePoster>>) => void = () => undefined
            mockedSet.mockReturnValue(new Promise((resolve) => {
                answer = resolve
            }))
            const onChanged = renderSection(LINK)

            const dialog = await openCrop(user)
            within(dialog).getByRole('group', {name: /Panel frame 2:3/}).focus()
            await user.keyboard('{ArrowRight}')
            await user.click(within(dialog).getByRole('button', {name: 'Save'}))

            const [noteId, url, crop] = mockedSet.mock.lastCall!
            expect([noteId, url]).toEqual(['note-1', LINK])
            expect(crop!.poster.x).toBeGreaterThan(0.3)
            expect(crop!.avatar).toEqual({x: 0.2, y: 0, w: 0.6, h: 1})
            expect(within(dialog).getByText('Saving…')).toBeInTheDocument()
            expect(within(dialog).getByRole('button', {name: 'Cancel'})).toBeDisabled()
            await user.keyboard('{Escape}')
            expect(screen.getByRole('dialog', {name: 'Crop poster'})).toBeInTheDocument()

            await act(async () => answer({id: 'note-1', source: 'MANUAL', status: 'READY', content: 'x',
                poster: {url: LINK, crop: crop!}}))
            await waitFor(() => expect(onChanged).toHaveBeenCalledWith({url: LINK, crop}))
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(screen.getByRole('img', {name: 'Tokyo Story poster'}).style.width).toBe('250%')
        })

        it('starts from the stored frames fitted to the image', async () => {
            const user = userEvent.setup()
            mockedSet.mockResolvedValue({id: 'note-1', source: 'MANUAL', status: 'READY', content: 'x',
                poster: {url: LINK, crop: CROP}})
            render(<Owner initial={{url: LINK, crop: CROP}} onChanged={vi.fn()}/>)

            const dialog = await openCrop(user)
            expect(within(dialog).getByText('100%')).toBeInTheDocument()
            await user.click(within(dialog).getByRole('button', {name: 'Save'}))

            expect(mockedSet).toHaveBeenCalledWith('note-1', LINK, CROP)
        })

        it('keeps the frames and says so when saving fails', async () => {
            const user = userEvent.setup()
            mockedSet.mockRejectedValue(new NoteApiError('http', 'note poster save failed', 500))
            const onChanged = renderSection(LINK)

            const dialog = await openCrop(user)
            await user.click(within(dialog).getByRole('button', {name: 'Zoom in'}))
            await user.click(within(dialog).getByRole('button', {name: 'Save'}))

            expect(await within(dialog).findByText('Couldn’t save the crop. Try again.')).toBeInTheDocument()
            expect(within(dialog).getByText('115%')).toBeInTheDocument()
            expect(within(dialog).getByRole('button', {name: 'Save'})).toBeEnabled()
            expect(onChanged).not.toHaveBeenCalled()
        })

        it('closes on Cancel without saving', async () => {
            const user = userEvent.setup()
            renderSection(LINK)

            const dialog = await openCrop(user)
            await user.click(within(dialog).getByRole('button', {name: 'Zoom in'}))
            await user.click(within(dialog).getByRole('button', {name: 'Cancel'}))

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(mockedSet).not.toHaveBeenCalled()
        })

        it('cannot save a crop of an image that does not load', async () => {
            const user = userEvent.setup()
            renderSection(LINK)

            await user.click(screen.getByRole('button', {name: 'Crop poster'}))
            ;(await probed(LINK)).fail()
            const dialog = screen.getByRole('dialog', {name: 'Crop poster'})

            expect(within(dialog).getByText('Image unavailable')).toBeInTheDocument()
            expect(within(dialog).getByRole('button', {name: 'Save'})).toBeDisabled()
        })

        it('keeps the frames when the same link is saved again and drops them for another link', async () => {
            const user = userEvent.setup()
            mockedSet.mockResolvedValue({id: 'note-1', source: 'MANUAL', status: 'READY', content: 'x',
                poster: {url: LINK, crop: CROP}})
            render(<Owner initial={{url: LINK, crop: CROP}} onChanged={vi.fn()}/>)

            await user.click(screen.getByRole('button', {name: 'Change poster'}))
            ;(await probed(LINK)).load(1000, 600)
            await user.click(screen.getByRole('button', {name: 'Save'}))
            expect(mockedSet).toHaveBeenLastCalledWith('note-1', LINK, CROP)

            await user.click(await screen.findByRole('button', {name: 'Change poster'}))
            const field = screen.getByRole('textbox', {name: 'Image link'})
            await user.clear(field)
            await user.paste('https://example.com/other.jpg')
            ;(await probed('https://example.com/other.jpg')).load(1000, 600)
            await user.click(screen.getByRole('button', {name: 'Save'}))
            expect(mockedSet).toHaveBeenLastCalledWith('note-1', 'https://example.com/other.jpg', undefined)
        })
    })
})
