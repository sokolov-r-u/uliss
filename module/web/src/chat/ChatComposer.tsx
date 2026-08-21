import {SendIcon} from '../ui/icons'
import {MicButton} from './MicButton'

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
        <form
            className="chat-composer"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            <input
                type="text"
                className="chat-composer-input"
                placeholder="Write a thought…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            />
            <MicButton/>
            <button type="submit" className="chat-composer-send" disabled={disabled || value.trim() === ''}>
                <SendIcon/>
            </button>
        </form>
    )
}
