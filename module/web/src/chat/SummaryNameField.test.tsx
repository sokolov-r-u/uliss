import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useState} from 'react'
import {isSummaryNameTooLong, SummaryNameField} from './SummaryNameField'
import {getMaxRecordingSeconds, transcribe} from '../voice/speechApi'

vi.mock('../voice/speechApi', async (importActual) => ({
    ...(await importActual<typeof import('../voice/speechApi')>()),
    transcribe: vi.fn(),
    getMaxRecordingSeconds: vi.fn(),
}))

const mockedTranscribe = vi.mocked(transcribe)
const mockedLimit = vi.mocked(getMaxRecordingSeconds)

/** Records one chunk; `stop` delivers it and fires `onstop` like the browser does. */
class FakeRecorder {
    static isTypeSupported = () => true
    state: 'inactive' | 'recording' = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null

    start() {
        this.state = 'recording'
    }

    stop() {
        this.state = 'inactive'
        this.ondataavailable?.({data: new Blob(['voice'])})
        this.onstop?.()
    }
}

function Harness({initial = '', onDictating = vi.fn()}: { initial?: string; onDictating?: (on: boolean) => void }) {
    const [value, setValue] = useState(initial)
    return <SummaryNameField value={value} onChange={setValue} onDictatingChange={onDictating}/>
}

const field = () => screen.getByRole('textbox', {name: 'Name'})

describe('isSummaryNameTooLong', () => {
    it('counts code points of the trimmed name with ASCII whitespace runs as one, like the service', () => {
        expect(isSummaryNameTooLong('a'.repeat(50))).toBe(false)
        expect(isSummaryNameTooLong('a'.repeat(51))).toBe(true)
        expect(isSummaryNameTooLong(`  ${'🎷'.repeat(50)}  `)).toBe(false)
        expect(isSummaryNameTooLong(`${'a'.repeat(25)}     ${'b'.repeat(24)}`)).toBe(false)
        expect(isSummaryNameTooLong(`${'a'.repeat(25)}  ${'b'.repeat(24)}`)).toBe(true)
    })
})

describe('SummaryNameField', () => {
    beforeEach(() => {
        mockedTranscribe.mockReset()
        mockedLimit.mockReset().mockResolvedValue(300)
        vi.stubGlobal('MediaRecorder', FakeRecorder)
        vi.stubGlobal('isSecureContext', true)
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {getUserMedia: vi.fn().mockResolvedValue({getTracks: () => [{stop: vi.fn()}]})},
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('keeps a name over the limit whole and says to shorten it', () => {
        render(<Harness/>)

        fireEvent.change(field(), {target: {value: 'x'.repeat(55)}})

        expect(field()).toHaveValue('x'.repeat(55))
        expect(screen.getByText('55/50')).toBeInTheDocument()
        expect(field()).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByRole('alert')).toHaveTextContent('Shorten the name to 50 characters.')

        fireEvent.change(field(), {target: {value: 'Giant Steps'}})
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('records at most 30 seconds even when the service allows more, and adds the text to the name', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        mockedTranscribe.mockResolvedValue('Steps')
        const onDictating = vi.fn()
        render(<Harness initial="Giant" onDictating={onDictating}/>)
        await waitFor(() => expect(mockedLimit).toHaveBeenCalled())

        fireEvent.click(screen.getByRole('button', {name: 'Dictate the name'}))
        await screen.findByRole('button', {name: 'Stop recording'})
        expect(screen.getByRole('status')).toHaveTextContent('Recording 0:00 / 0:30')
        expect(onDictating).toHaveBeenLastCalledWith(true)
        await act(async () => vi.advanceTimersByTime(30_100))

        await waitFor(() => expect(field()).toHaveValue('Giant Steps'))
        expect(onDictating).toHaveBeenLastCalledWith(false)
    })

    it('keeps the service limit when it is shorter than 30 seconds', async () => {
        mockedLimit.mockResolvedValue(10)
        render(<Harness/>)
        await waitFor(() => expect(mockedLimit).toHaveBeenCalled())

        fireEvent.click(screen.getByRole('button', {name: 'Dictate the name'}))
        await screen.findByRole('button', {name: 'Stop recording'})

        expect(screen.getByRole('status')).toHaveTextContent('Recording 0:00 / 0:10')
    })

    it('never cuts a long dictation: the name is marked too long instead', async () => {
        mockedTranscribe.mockResolvedValue('a very long dictated name that keeps going well past the limit')
        render(<Harness/>)

        fireEvent.click(screen.getByRole('button', {name: 'Dictate the name'}))
        fireEvent.click(await screen.findByRole('button', {name: 'Stop recording'}))

        await waitFor(() => expect(field())
            .toHaveValue('a very long dictated name that keeps going well past the limit'))
        expect(field()).toHaveAttribute('aria-invalid', 'true')
    })
})
