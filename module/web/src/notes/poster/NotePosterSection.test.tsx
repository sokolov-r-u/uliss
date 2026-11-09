import {act, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {NoteApiError, removeNotePoster, setNotePoster} from '../noteApi'
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
function Owner({initial, onChanged}: { initial?: string; onChanged: (posterUrl: string | undefined) => void }) {
    const [posterUrl, setPosterUrl] = useState(initial)
    return <NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', posterUrl}} onChanged={(next) => {
        onChanged(next)
        setPosterUrl(next)
    }}/>
}

function renderSection(posterUrl?: string, onChanged = vi.fn()) {
    render(<Owner initial={posterUrl} onChanged={onChanged}/>)
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
        mockedSet.mockResolvedValue({id: 'note-1', source: 'MANUAL', status: 'READY', content: 'x', posterUrl: LINK})
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

        expect(mockedSet).toHaveBeenCalledWith('note-1', LINK)
        await waitFor(() => expect(onChanged).toHaveBeenCalledWith(LINK))
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
        const {rerender} = render(<NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', posterUrl: LINK}}
                                                     onChanged={vi.fn()}/>)

        rerender(<NotePosterSection note={{id: 'note-1', title: 'Tokyo Story', posterUrl: 'https://example.com/new.jpg'}}
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
        const {unmount} = render(<NotePosterSection note={{id: 'note-1', posterUrl: LINK}} onChanged={vi.fn()}/>)

        await user.click(screen.getByRole('button', {name: 'Poster'}))
        expect(screen.queryByRole('button', {name: 'Change poster'})).not.toBeInTheDocument()
        unmount()
        render(<NotePosterSection note={{id: 'note-2'}} onChanged={vi.fn()}/>)

        expect(screen.getByRole('button', {name: 'Poster'})).toHaveAttribute('aria-expanded', 'false')
    })
})
