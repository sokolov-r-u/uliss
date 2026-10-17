import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from '../auth/apiClient'
import {SpeechApiError, transcribe} from './speechApi'

vi.mock('../auth/apiClient', () => ({
    authFetch: vi.fn(),
    AuthRequiredError: class AuthRequiredError extends Error {
    },
}))

const mockedFetch = vi.mocked(authFetch)

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

async function failureKind(promise: Promise<unknown>): Promise<string> {
    const error = await promise.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SpeechApiError)
    return (error as SpeechApiError).kind
}

describe('transcribe', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
    })

    it('posts the recording as the audio part and returns the trimmed text', async () => {
        mockedFetch.mockResolvedValue(json({text: '  Привет, world \n'}))
        const audio = new Blob(['webm'], {type: 'audio/webm;codecs=opus'})
        const controller = new AbortController()

        await expect(transcribe(audio, controller.signal)).resolves.toBe('Привет, world')

        const [path, init] = mockedFetch.mock.calls[0]
        expect(path).toBe('/note/speech/transcriptions')
        expect(init?.method).toBe('POST')
        expect(init?.signal).toBe(controller.signal)
        // The browser sets the multipart boundary itself, so no Content-Type is forced here.
        expect(init?.headers).toBeUndefined()
        const part = (init?.body as FormData).get('audio') as File
        expect(part.type).toBe('audio/webm;codecs=opus')
        expect(part.size).toBe(4)
    })

    it('tells refusals that a retry cannot fix from failures that a retry may', async () => {
        mockedFetch.mockResolvedValueOnce(json({code: 'UNSUPPORTED_AUDIO'}, 400))
        expect(await failureKind(transcribe(new Blob()))).toBe('refused')

        mockedFetch.mockResolvedValueOnce(json({code: 'AUDIO_TOO_LARGE'}, 413))
        expect(await failureKind(transcribe(new Blob()))).toBe('tooLarge')

        mockedFetch.mockResolvedValueOnce(json({code: 'TRANSCRIPTION_FAILED'}, 502))
        expect(await failureKind(transcribe(new Blob()))).toBe('failed')

        mockedFetch.mockResolvedValueOnce(new Response('<html>', {status: 200}))
        expect(await failureKind(transcribe(new Blob()))).toBe('failed')

        mockedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        expect(await failureKind(transcribe(new Blob()))).toBe('transport')
    })

    it('lets an abort through unchanged', async () => {
        mockedFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'))

        const error: unknown = await transcribe(new Blob()).catch((caught: unknown) => caught)
        expect(error).not.toBeInstanceOf(SpeechApiError)
        expect((error as { name?: string }).name).toBe('AbortError')
    })
})

describe('getMaxRecordingSeconds', () => {
    beforeEach(() => {
        mockedFetch.mockReset()
        vi.resetModules()
    })

    it('reads the limit once per page load', async () => {
        mockedFetch.mockResolvedValue(json({maxDurationSeconds: 90}))
        const {getMaxRecordingSeconds} = await import('./speechApi')

        await expect(getMaxRecordingSeconds()).resolves.toBe(90)
        await expect(getMaxRecordingSeconds()).resolves.toBe(90)
        expect(mockedFetch).toHaveBeenCalledOnce()
        expect(mockedFetch).toHaveBeenCalledWith('/note/speech/settings', undefined)
    })

    it('falls back to five minutes on a failure and asks again next time', async () => {
        mockedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        mockedFetch.mockResolvedValueOnce(json({maxDurationSeconds: 120}))
        const {getMaxRecordingSeconds} = await import('./speechApi')

        await expect(getMaxRecordingSeconds()).resolves.toBe(300)
        await expect(getMaxRecordingSeconds()).resolves.toBe(120)
    })

    it('ignores a malformed limit', async () => {
        mockedFetch.mockResolvedValue(json({maxDurationSeconds: 'soon'}))
        const {getMaxRecordingSeconds} = await import('./speechApi')

        await expect(getMaxRecordingSeconds()).resolves.toBe(300)
    })
})
