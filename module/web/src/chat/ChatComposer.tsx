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
                             }: {
    value: string
    onChange: (v: string) => void
    onSubmit: () => void
    disabled?: boolean
}) {
    return (
        <ChatDock
            className="chat-composer"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            voiceDisabled
            placeholder="Write a thought…"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        />
    )
}
