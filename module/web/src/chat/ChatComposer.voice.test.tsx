import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useState} from 'react'
import {appendDictation, ChatComposer} from './ChatComposer'
import {getMaxRecordingSeconds, SpeechApiError, transcribe} from '../voice/speechApi'

vi.mock('../voice/speechApi', async (importActual) => ({
    ...(await importActual<typeof import('../voice/speechApi')>()),
    transcribe: vi.fn(),
    getMaxRecordingSeconds: vi.fn(),
}))

const mockedTranscribe = vi.mocked(transcribe)
const mockedLimit = vi.mocked(getMaxRecordingSeconds)

/** Records one chunk; `stop` delivers it and fires `onstop` like the browser does. */
class FakeRecorder {
    static instances: FakeRecorder[] = []
    static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus'
    state: 'inactive' | 'recording' = 'inactive'
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null

    constructor(public stream: MediaStream, public options?: { mimeType?: string }) {
        FakeRecorder.instances.push(this)
    }

    get mimeType() {
        return this.options?.mimeType ?? ''
    }

    start() {
        this.state = 'recording'
    }

    stop() {
        this.state = 'inactive'
        this.ondataavailable?.({data: new Blob(['voice'], {type: this.mimeType})})
        this.onstop?.()
    }
}

const track = {stop: vi.fn()}
const getUserMedia = vi.fn()

function Harness({initial = '', onSubmit = vi.fn(), generationActive = false}: {
    initial?: string
    onSubmit?: (text?: string) => void
    generationActive?: boolean
}) {
    const [value, setValue] = useState(initial)
    return <ChatComposer value={value} onChange={setValue} onSubmit={onSubmit} generationActive={generationActive}
                         onStop={() => undefined}/>
}

async function startRecording() {
    fireEvent.click(screen.getByRole('button', {name: 'Voice input'}))
    await screen.findByRole('button', {name: 'Stop recording'})
}

describe('ChatComposer dictation', () => {
    beforeEach(() => {
        FakeRecorder.instances = []
        track.stop.mockReset()
        getUserMedia.mockReset().mockResolvedValue({getTracks: () => [track]})
        mockedTranscribe.mockReset()
        mockedLimit.mockReset().mockResolvedValue(300)
        vi.stubGlobal('MediaRecorder', FakeRecorder)
        vi.stubGlobal('isSecureContext', true)
        Object.defineProperty(navigator, 'mediaDevices', {configurable: true, value: {getUserMedia}})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('Stop puts the text after the draft and frees the microphone', async () => {
        mockedTranscribe.mockResolvedValue('second thought')
        const onSubmit = vi.fn()
        render(<Harness initial="First" onSubmit={onSubmit}/>)

        await startRecording()
        expect(screen.getByRole('status')).toHaveTextContent('Recording0:00 / 5:00')
        fireEvent.click(screen.getByRole('button', {name: 'Stop recording'}))

        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toHaveValue('First second thought'))
        expect(onSubmit).not.toHaveBeenCalled()
        expect(track.stop).toHaveBeenCalled()
        expect(FakeRecorder.instances[0].options).toEqual({mimeType: 'audio/webm;codecs=opus'})
        expect(mockedTranscribe.mock.calls[0][0].type).toBe('audio/webm;codecs=opus')
    })

    it('Send submits the dictated draft at once', async () => {
        mockedTranscribe.mockResolvedValue('Buy milk')
        const onSubmit = vi.fn()
        render(<Harness onSubmit={onSubmit}/>)

        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Send recording'}))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Buy milk'))
        expect(screen.getByRole('textbox', {name: 'Message'})).toHaveValue('Buy milk')
    })

    it('locks the field while transcribing', async () => {
        let finish: (text: string) => void = () => undefined
        mockedTranscribe.mockReturnValue(new Promise((resolve) => (finish = resolve)))
        render(<Harness initial="draft"/>)

        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Stop recording'}))

        expect(await screen.findByRole('button', {name: 'Transcribing…'})).toBeDisabled()
        expect(screen.getByRole('textbox', {name: 'Message'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Send'})).toBeDisabled()
        await act(async () => finish('more'))
        expect(screen.getByRole('textbox', {name: 'Message'})).toBeEnabled()
    })

    it('a failed transcription keeps the recording for a manual retry with the same intent', async () => {
        mockedTranscribe.mockRejectedValueOnce(new SpeechApiError('failed', '502')).mockResolvedValueOnce('Retried')
        const onSubmit = vi.fn()
        render(<Harness onSubmit={onSubmit}/>)

        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Send recording'}))

        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't transcribe the recording")
        expect(onSubmit).not.toHaveBeenCalled()
        expect(mockedTranscribe).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', {name: 'Retry transcription'}))

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Retried'))
        expect(mockedTranscribe.mock.calls[1][0]).toBe(mockedTranscribe.mock.calls[0][0])
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Retry transcription'})).not.toBeInTheDocument()
    })

    it('a new recording throws the failed one away', async () => {
        mockedTranscribe.mockRejectedValueOnce(new SpeechApiError('transport', 'offline'))
        render(<Harness/>)
        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Stop recording'}))
        await screen.findByRole('button', {name: 'Retry transcription'})

        await startRecording()

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Retry transcription'})).not.toBeInTheDocument()
    })

    it('a refused or oversized recording is reported without a retry', async () => {
        mockedTranscribe.mockRejectedValueOnce(new SpeechApiError('tooLarge', '413'))
        render(<Harness/>)

        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Stop recording'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('The recording is too large to transcribe')
        expect(screen.queryByRole('button', {name: 'Retry transcription'})).not.toBeInTheDocument()
    })

    it('silence leaves the draft alone and says nothing was heard', async () => {
        mockedTranscribe.mockResolvedValue('')
        const onSubmit = vi.fn()
        render(<Harness initial="keep" onSubmit={onSubmit}/>)

        await startRecording()
        fireEvent.click(screen.getByRole('button', {name: 'Send recording'}))

        expect(await screen.findByText('Nothing heard')).toBeInTheDocument()
        expect(screen.getByRole('textbox', {name: 'Message'})).toHaveValue('keep')
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('a blocked microphone asks for access', async () => {
        getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
        render(<Harness/>)

        fireEvent.click(screen.getByRole('button', {name: 'Voice input'}))

        expect(await screen.findByRole('alert')).toHaveTextContent('Allow microphone access to dictate')
        expect(screen.getByRole('button', {name: 'Voice input'})).toBeEnabled()
    })

    it('stops by itself at the length limit and puts the text into the field', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        mockedLimit.mockResolvedValue(2)
        mockedTranscribe.mockResolvedValue('long talk')
        const onSubmit = vi.fn()
        render(<Harness onSubmit={onSubmit}/>)
        await waitFor(() => expect(mockedLimit).toHaveBeenCalled())

        await startRecording()
        expect(screen.getByRole('status')).toHaveTextContent('0:00 / 0:02')
        await act(async () => vi.advanceTimersByTime(2_100))

        await waitFor(() => expect(screen.getByRole('textbox', {name: 'Message'})).toHaveValue('long talk'))
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('leaving the screen mid-recording throws the recording away', async () => {
        const page = render(<Harness/>)
        await startRecording()

        page.unmount()

        expect(track.stop).toHaveBeenCalled()
        expect(mockedTranscribe).not.toHaveBeenCalled()
    })

    it('the mic waits while the model is answering', () => {
        render(<Harness generationActive/>)

        expect(screen.getByRole('button', {name: 'Voice input'})).toBeDisabled()
    })

    it('a browser that cannot record shows voice as unavailable', () => {
        vi.stubGlobal('MediaRecorder', undefined)
        render(<Harness/>)

        expect(screen.getByRole('button', {name: 'Voice input unavailable'})).toBeDisabled()
        expect(mockedLimit).not.toHaveBeenCalled()
    })

    it('an insecure page shows voice as unavailable', () => {
        vi.stubGlobal('isSecureContext', false)
        render(<Harness/>)

        expect(screen.getByRole('button', {name: 'Voice input unavailable'})).toBeDisabled()
    })
})

describe('appendDictation', () => {
    it('replaces a blank draft, keeps existing whitespace, and otherwise joins with a space', () => {
        expect(appendDictation('  ', 'text')).toBe('text')
        expect(appendDictation('line\n', 'text')).toBe('line\ntext')
        expect(appendDictation('word', 'text')).toBe('word text')
    })
})
