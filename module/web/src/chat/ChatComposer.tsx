import type {ReactNode} from 'react'
import {ChatDock} from '@uliss/design-system'
import './chat.css'

/**
 * The composer at the foot of a chat — DS `ChatDock` shape (46px minimum `--bg-panel` field,
 * `--line-strong` edge, inline tiles). Voice and typing share the dock; the mic is disabled
 * (text-only chat). Also the command field of note edit mode.
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
    onSubmit: () => void
    disabled?: boolean
    generationActive?: boolean
    onStop?: () => void
    action?: ReactNode
    placeholder?: string
}) {
    return (
        <ChatDock
            className="chat-composer"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            generationActive={generationActive}
            onStop={onStop}
            voiceDisabled
            placeholder={placeholder}
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            {action}
        </ChatDock>
    )
}
