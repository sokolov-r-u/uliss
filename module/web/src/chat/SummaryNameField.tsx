import {useEffect, useRef} from 'react'
import {Icon, IconButton, TextField} from '@uliss/design-system'
import {appendDictation} from '../voice/appendDictation'
import {type DictationState, useDictation} from '../voice/useDictation'

/** The note-service title rule: at most 50 code points after trimming. */
export const SUMMARY_NAME_LIMIT = 50
/** A name is a few words; a long recording would only be cut by the limit anyway. */
const NAME_DICTATION_SECONDS = 30

/** True when the name, as the service counts it, is over the limit and the summary must not start. */
export function isSummaryNameTooLong(name: string): boolean {
    return [...name.trim().replace(/[ \t\n\v\f\r]+/g, ' ')].length > SUMMARY_NAME_LIMIT
}

function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const MIC_TITLES: Record<DictationState, string> = {
    idle: 'Dictate the name',
    recording: 'Stop recording',
    transcribing: 'Transcribing…',
    failed: 'Retry the transcription',
}

/**
 * The optional name of a new summary note, typed or dictated (up to 30 seconds). Dictated text joins what is typed and
 * is never cut: past the limit the field turns terracotta and the host keeps the summary from starting.
 */
export function SummaryNameField({value, onChange, disabled, onDictatingChange}: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    /** Recording or transcribing: the host holds the summary until the text lands in the field. */
    onDictatingChange?: (dictating: boolean) => void
}) {
    const valueRef = useRef(value)
    valueRef.current = value
    const dictation = useDictation(
        (text) => onChange(appendDictation(valueRef.current, text)),
        {maxSeconds: NAME_DICTATION_SECONDS},
    )
    const dictating = dictation.state === 'recording' || dictation.state === 'transcribing'
    const onDictatingChangeRef = useRef(onDictatingChange)
    onDictatingChangeRef.current = onDictatingChange
    useEffect(() => {
        onDictatingChangeRef.current?.(dictating)
    }, [dictating])

    function onMic() {
        if (dictation.state === 'recording') dictation.stop()
        else if (dictation.state === 'failed') dictation.retry()
        else dictation.start()
    }

    const mic = dictation.supported && <IconButton
        title={MIC_TITLES[dictation.state]}
        aria-pressed={dictation.state === 'recording'}
        disabled={disabled || dictation.state === 'transcribing'}
        color={dictation.state === 'recording' ? 'var(--accent)'
            : dictation.state === 'failed' ? 'var(--accent-2)' : undefined}
        className={dictating ? 'u-pending' : undefined}
        onClick={onMic}>
        <Icon name="mic" size={16}/>
    </IconButton>

    return <div className="summary-name">
        <TextField label="Name" placeholder="Uliss names it if you leave this empty" value={value}
                   limit={SUMMARY_NAME_LIMIT} disabled={disabled || dictating}
                   onChange={(event) => onChange(event.target.value)} trailing={mic}/>
        {dictation.state === 'recording' && <p className="summary-name-status" role="status">
            Recording {clock(dictation.elapsedSeconds)} / {clock(dictation.maxSeconds)}
        </p>}
        {dictation.state === 'transcribing' && <p className="summary-name-status" role="status">Transcribing…</p>}
        {dictation.notice && <p className={`chat-voice-notice chat-voice-notice-${dictation.notice.tone}`}
                                role={dictation.notice.tone === 'error' ? 'alert' : 'status'}>
            {dictation.notice.text}
        </p>}
    </div>
}
