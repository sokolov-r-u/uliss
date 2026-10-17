import type {ReactNode} from 'react'
import {useRef} from 'react'
import {ChatDock} from '@uliss/design-system'
import {type DictationIntent, useDictation} from '../voice/useDictation'
import './chat.css'

/** Dictated text joins the draft after a space, or replaces an empty one. */
export function appendDictation(draft: string, text: string): string {
    if (draft.trim() === '') return text
    return /\s$/.test(draft) ? draft + text : `${draft} ${text}`
}

/**
 * The composer at the foot of a chat — DS `ChatDock` shape (46px minimum `--bg-panel` field,
 * `--line-strong` edge, inline tiles). Voice and typing share the dock: Stop puts the dictated text
 * into the field, Send submits it at once. Also the command field of note edit mode.
 */
export function ChatComposer({
                                 value,
                                 onChange,
                                 onSubmit,
                                 disabled,
                                 generationActive,
                                 onStop,
                                 action,
                                 placeholder = 'Write a thought…',
                             }: {
    value: string
    onChange: (v: string) => void
    /** `text` is the draft to send when it changed in the same step (dictation's Send); otherwise use `value`. */
    onSubmit: (text?: string) => void
    disabled?: boolean
    generationActive?: boolean
    onStop?: () => void
    action?: ReactNode
    placeholder?: string
}) {
    const valueRef = useRef(value)
    valueRef.current = value
    const dictation = useDictation((text: string, intent: DictationIntent) => {
        const next = appendDictation(valueRef.current, text)
        onChange(next)
        if (intent === 'send') onSubmit(next)
    })

    return (
        <>
            {dictation.notice && <p className={`chat-voice-notice chat-voice-notice-${dictation.notice.tone}`}
                                    role={dictation.notice.tone === 'error' ? 'alert' : 'status'}>
                {dictation.notice.text}
            </p>}
            <ChatDock
                className="chat-composer"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                generationActive={generationActive}
                onStop={onStop}
                voiceDisabled={!dictation.supported}
                voice={dictation.supported ? {
                    state: dictation.state,
                    elapsedSeconds: dictation.elapsedSeconds,
                    maxSeconds: dictation.maxSeconds,
                    onStart: dictation.start,
                    onStop: dictation.stop,
                    onSend: dictation.send,
                    onRetry: dictation.retry,
                } : undefined}
                placeholder={placeholder}
                onSubmit={(e) => {
                    e.preventDefault()
                    onSubmit()
                }}
            >
                {action}
            </ChatDock>
        </>
    )
}
