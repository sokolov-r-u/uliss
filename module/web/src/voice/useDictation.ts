import {useCallback, useEffect, useRef, useState} from 'react'
import {DEFAULT_MAX_RECORDING_SECONDS, getMaxRecordingSeconds, SpeechApiError, transcribe} from './speechApi'

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'failed'

/** `field` — the text goes into the composer; `send` — it is sent at once. */
export type DictationIntent = 'field' | 'send'

export interface DictationNotice {
    text: string
    tone: 'info' | 'error'
}

/** Containers the service accepts, in order of preference; Safari records only `audio/mp4`. */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
const TICK_MS = 250

export const NOTHING_HEARD = 'Nothing heard'
export const TRANSCRIPTION_FAILED = "Couldn't transcribe the recording"
export const MICROPHONE_BLOCKED = 'Allow microphone access to dictate'
export const MICROPHONE_UNAVAILABLE = "Couldn't start the microphone"
export const RECORDING_REFUSED = "Uliss couldn't read this recording"
export const RECORDING_TOO_LARGE = 'The recording is too large to transcribe'

/** Browser recording needs `MediaRecorder` and a secure context (HTTPS or localhost). */
export function isDictationSupported(): boolean {
    return typeof window !== 'undefined'
        && window.isSecureContext
        && typeof window.MediaRecorder !== 'undefined'
        && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

function pickRecordingType(): string | undefined {
    return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function isPermissionError(error: unknown): boolean {
    return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
}

interface Recording {
    recorder: MediaRecorder
    stream: MediaStream
    chunks: Blob[]
    timer: ReturnType<typeof setInterval>
    /** Set by Stop/Send/the limit; null when the recording is thrown away. */
    intent: DictationIntent | null
}

/**
 * One recording at a time: start → stop (or the length limit) → one upload → text for [onText]. A failed upload keeps
 * the recording for a manual [retry] until a new recording starts or the owner unmounts; nothing retries by itself.
 */
export function useDictation(onText: (text: string, intent: DictationIntent) => void) {
    const [state, setState] = useState<DictationState>('idle')
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [maxSeconds, setMaxSeconds] = useState(DEFAULT_MAX_RECORDING_SECONDS)
    const [notice, setNotice] = useState<DictationNotice | null>(null)
    const [supported] = useState(isDictationSupported)

    const onTextRef = useRef(onText)
    onTextRef.current = onText
    const recordingRef = useRef<Recording | null>(null)
    const failedRef = useRef<{ audio: Blob; intent: DictationIntent } | null>(null)
    const uploadRef = useRef<AbortController | null>(null)
    const mountedRef = useRef(true)
    const maxSecondsRef = useRef(maxSeconds)
    maxSecondsRef.current = maxSeconds

    useEffect(() => {
        if (!supported) return
        void getMaxRecordingSeconds().then((seconds) => {
            if (mountedRef.current) setMaxSeconds(seconds)
        })
    }, [supported])

    const upload = useCallback(async (audio: Blob, intent: DictationIntent) => {
        const controller = new AbortController()
        uploadRef.current = controller
        failedRef.current = null
        setState('transcribing')
        try {
            const text = await transcribe(audio, controller.signal)
            if (!mountedRef.current) return
            setState('idle')
            if (text === '') setNotice({text: NOTHING_HEARD, tone: 'info'})
            else onTextRef.current(text, intent)
        } catch (error) {
            if (!mountedRef.current || isAbortError(error)) return
            if (error instanceof SpeechApiError && (error.kind === 'refused' || error.kind === 'tooLarge')) {
                setState('idle')
                setNotice({text: error.kind === 'refused' ? RECORDING_REFUSED : RECORDING_TOO_LARGE, tone: 'error'})
                return
            }
            failedRef.current = {audio, intent}
            setState('failed')
            setNotice({text: TRANSCRIPTION_FAILED, tone: 'error'})
        } finally {
            if (uploadRef.current === controller) uploadRef.current = null
        }
    }, [])

    const finish = useCallback((intent: DictationIntent | null) => {
        const recording = recordingRef.current
        if (recording === null) return
        recording.intent = intent
        clearInterval(recording.timer)
        if (recording.recorder.state !== 'inactive') recording.recorder.stop()
        else recording.stream.getTracks().forEach((track) => track.stop())
    }, [])

    const start = useCallback(async () => {
        if (!supported || recordingRef.current !== null || uploadRef.current !== null) return
        failedRef.current = null
        setNotice(null)
        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({audio: true})
        } catch (error) {
            if (!mountedRef.current) return
            setState('idle')
            setNotice({text: isPermissionError(error) ? MICROPHONE_BLOCKED : MICROPHONE_UNAVAILABLE, tone: 'error'})
            return
        }
        if (!mountedRef.current) {
            stream.getTracks().forEach((track) => track.stop())
            return
        }
        const type = pickRecordingType()
        const recorder = new MediaRecorder(stream, type ? {mimeType: type} : undefined)
        const startedAt = Date.now()
        const recording: Recording = {
            recorder,
            stream,
            chunks: [],
            intent: null,
            timer: setInterval(() => {
                const seconds = Math.floor((Date.now() - startedAt) / 1000)
                setElapsedSeconds(seconds)
                // the limit stops the recording as Stop does: the text goes into the field
                if (seconds >= maxSecondsRef.current) finish('field')
            }, TICK_MS),
        }
        recordingRef.current = recording
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) recording.chunks.push(event.data)
        }
        recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop())
            recordingRef.current = null
            if (!mountedRef.current) return
            setElapsedSeconds(0)
            if (recording.intent === null) {
                setState('idle')
                return
            }
            const audio = new Blob(recording.chunks, {type: recorder.mimeType || type || 'audio/webm'})
            void upload(audio, recording.intent)
        }
        setElapsedSeconds(0)
        setState('recording')
        recorder.start()
    }, [finish, supported, upload])

    const retry = useCallback(() => {
        const failed = failedRef.current
        if (failed === null || uploadRef.current !== null) return
        setNotice(null)
        void upload(failed.audio, failed.intent)
    }, [upload])

    // Leaving the screen throws a recording away, frees the microphone and drops an upload in flight.
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            finish(null)
            uploadRef.current?.abort()
            failedRef.current = null
        }
    }, [finish])

    return {
        supported,
        state,
        elapsedSeconds,
        maxSeconds,
        notice,
        start: () => void start(),
        stop: () => finish('field'),
        send: () => finish('send'),
        retry,
    }
}
