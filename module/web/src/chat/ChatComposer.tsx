import type {ReactNode} from 'react'
import {ChatDock} from '@uliss/design-system'

/**
 * The composer at the foot of a chat — DS `ChatDock` shape (46px `--bg-panel` field, `--line-strong`
 * edge, inline tiles). Voice and typing share the dock; the mic is disabled (text-only chat).
 */
export function ChatComposer({
                                 value,
                                 onChange,
                                 onSubmit,
                                 disabled,
                                 generationActive,
                                 onStop,
                                 action,
                             }: {
    value: string
    onChange: (v: string) => void
    onSubmit: () => void
    disabled?: boolean
    generationActive?: boolean
    onStop?: () => void
    action?: ReactNode
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
            placeholder="Write a thought…"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            {action}
        </ChatDock>
    )
}
