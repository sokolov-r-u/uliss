import type {ChangeEventHandler, FormEventHandler, KeyboardEventHandler, ReactNode} from 'react'
import {useLayoutEffect, useRef} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'

const TEXTAREA_MIN_HEIGHT = 34
const TEXTAREA_MAX_HEIGHT = 144

/** idle → recording → transcribing → (text lands in the field) or failed (the recording is kept for a retry). */
export type ChatDockVoiceState = 'idle' | 'recording' | 'transcribing' | 'failed'

export interface ChatDockVoice {
    state: ChatDockVoiceState
    /** Whole seconds recorded so far; shown with [maxSeconds] while recording. */
    elapsedSeconds?: number
    maxSeconds?: number
    /** Mic tile: starts a recording (idle, failed). */
    onStart: () => void
    /** Stop tile while recording: the text goes into the field. */
    onStop: () => void
    /** Send tile while recording: the text is sent at once. */
    onSend: () => void
    /** Retry tile after a failure: transcribes the kept recording again. */
    onRetry: () => void
}

export interface ChatDockProps {
    placeholder?: string
    value: string
    onChange: ChangeEventHandler<HTMLTextAreaElement>
    onSubmit?: FormEventHandler<HTMLFormElement>
    disabled?: boolean
    voiceDisabled?: boolean
    generationActive?: boolean
    onStop?: () => void
    onMic?: () => void
    /** Dictation; replaces `onMic`. Without it the mic is the plain tile governed by `voiceDisabled`. */
    voice?: ChatDockVoice
    /** Centred above the field — reserved for ActionChip. */
    children?: ReactNode
    className?: string
}

const tile = {background: 'var(--bg-muted)'}

function clock(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds))
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Native text composer with explicit send, dictation and unavailable-voice states. */
export function ChatDock({
                             placeholder = 'Write a thought…',
                             value,
                             onChange,
                             onSubmit,
                             disabled = false,
                             voiceDisabled = false,
                             generationActive = false,
                             onStop,
                             onMic,
                             voice,
                             children,
                             className,
                         }: ChatDockProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const voiceState = voice?.state ?? 'idle'
    const recording = voiceState === 'recording'
    const transcribing = voiceState === 'transcribing'
    const fieldLocked = disabled || generationActive || transcribing
    const micLocked = voiceDisabled || disabled || generationActive || transcribing

    // The field remounts after a recording, so its height is measured again then too.
    useLayoutEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.style.height = '0px'
        const height = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(input.scrollHeight, TEXTAREA_MAX_HEIGHT))
        input.style.height = `${height}px`
        input.style.overflowY = input.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
    }, [value, recording])

    const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        if (!fieldLocked && value.trim() !== '') {
            event.currentTarget.form?.requestSubmit()
        }
    }

    return (
        <form className={className} onSubmit={onSubmit} style={{padding: '10px 16px 18px', flex: '0 0 auto'}}>
            {children && <div style={{display: 'flex', justifyContent: 'center', marginBottom: 10}}>{children}</div>}
            <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                minHeight: 46,
                padding: '5px 6px 5px 16px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)'
            }}>
                {recording ? (
                    <div role="status" style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontFamily: 'var(--font-text)',
                        fontSize: 12.5,
                        letterSpacing: '0.3px',
                        color: 'var(--cream-dim)',
                    }}>
                        <span className="u-pending" aria-hidden style={{color: 'var(--accent-2)', display: 'flex'}}>
                            <Icon name="mic" size={18} fill/>
                        </span>
                        <span>Recording</span>
                        <span style={{marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)'}}>
                            {clock(voice?.elapsedSeconds ?? 0)}
                            {voice?.maxSeconds !== undefined && ` / ${clock(voice.maxSeconds)}`}
                        </span>
                    </div>
                ) : (
                    <textarea
                        ref={inputRef}
                        rows={1}
                        wrap="soft"
                        value={value}
                        onChange={onChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={fieldLocked}
                        aria-label="Message"
                        style={{
                            flex: 1,
                            minWidth: 0,
                            minHeight: TEXTAREA_MIN_HEIGHT,
                            maxHeight: TEXTAREA_MAX_HEIGHT,
                            border: 0,
                            outline: 0,
                            padding: '7px 0',
                            resize: 'none',
                            overflowX: 'hidden',
                            overflowY: 'hidden',
                            background: 'transparent',
                            color: 'var(--cream)',
                            fontFamily: 'var(--font-text)',
                            fontSize: 12.5,
                            lineHeight: '20px',
                            letterSpacing: '0.3px',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal'
                        }}
                    />
                )}
                {recording ? (
                    <>
                        <IconButton s={34} title="Stop recording" onClick={voice?.onStop} style={tile}>
                            <Icon name="stop" size={18}/>
                        </IconButton>
                        <IconButton s={34} title="Send recording" onClick={voice?.onSend} style={tile}>
                            <Icon name="arrowUp" size={18}/>
                        </IconButton>
                    </>
                ) : (
                    <>
                        {voiceState === 'failed' && (
                            <IconButton s={34} title="Retry transcription" disabled={disabled || generationActive}
                                        onClick={voice?.onRetry} style={tile} color="var(--accent-2)">
                                <Icon name="retry" size={18}/>
                            </IconButton>
                        )}
                        <IconButton s={34}
                                    title={transcribing ? 'Transcribing…' : voiceDisabled ? 'Voice input unavailable' : 'Voice input'}
                                    aria-busy={transcribing || undefined}
                                    disabled={micLocked} onClick={voice ? voice.onStart : onMic} style={tile}>
                            <span className={transcribing ? 'u-pending' : undefined} style={{display: 'flex'}}>
                                <Icon name="mic" size={18}/>
                            </span>
                        </IconButton>
                        {generationActive ? (
                            <IconButton s={34} title="Stop generation" type="button" onClick={onStop} style={tile}>
                                <Icon name="stop" size={18}/>
                            </IconButton>
                        ) : (
                            <IconButton s={34} title="Send" type="submit" disabled={fieldLocked || value.trim() === ''}
                                        style={tile}>
                                <Icon name="arrowUp" size={18}/>
                            </IconButton>
                        )}
                    </>
                )}
            </div>
        </form>
    )
}
