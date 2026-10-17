import {authFetch, AuthRequiredError} from '../auth/apiClient'

/** Used until the settings answer, and when they cannot be read; mirrors `note.speech.max-duration`. */
export const DEFAULT_MAX_RECORDING_SECONDS = 300

/**
 * `refused` — not a supported recording (400), `tooLarge` — over the size limit (413): retrying the same recording
 * cannot help. `failed` — the provider or the service failed (5xx), `transport` — no answer: a retry may succeed.
 */
export type SpeechFailureKind = 'refused' | 'tooLarge' | 'failed' | 'transport'

export class SpeechApiError extends Error {
    constructor(public readonly kind: SpeechFailureKind, message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'SpeechApiError'
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
    try {
        return await authFetch(path, init)
    } catch (error) {
        if (error instanceof AuthRequiredError || (error instanceof DOMException && error.name === 'AbortError')) {
            throw error
        }
        throw new SpeechApiError('transport', 'speech service is unreachable', {cause: error})
    }
}

let settings: Promise<number> | null = null

/** The recording length limit in seconds, read once per page load; a failure falls back to the default and is asked again. */
export function getMaxRecordingSeconds(): Promise<number> {
    settings ??= send('/note/speech/settings')
        .then(async (response) => {
            if (!response.ok) throw new SpeechApiError('failed', `settings failed with ${response.status}`)
            const body: unknown = await response.json()
            const seconds = isRecord(body) ? body.maxDurationSeconds : undefined
            return typeof seconds === 'number' && seconds > 0 ? seconds : DEFAULT_MAX_RECORDING_SECONDS
        })
        .catch(() => {
            settings = null
            return DEFAULT_MAX_RECORDING_SECONDS
        })
    return settings
}

/** Sends one recording and returns its trimmed text; empty text means nothing was heard. */
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
    const form = new FormData()
    form.append('audio', audio, 'recording')
    const response = await send('/note/speech/transcriptions', {method: 'POST', body: form, signal})
    if (response.status === 400) throw new SpeechApiError('refused', 'recording was refused')
    if (response.status === 413) throw new SpeechApiError('tooLarge', 'recording is too large')
    if (!response.ok) throw new SpeechApiError('failed', `transcription failed with ${response.status}`)
    const body: unknown = await response.json().catch(() => null)
    if (!isRecord(body) || typeof body.text !== 'string') {
        throw new SpeechApiError('failed', 'invalid transcription response')
    }
    return body.text.trim()
}
