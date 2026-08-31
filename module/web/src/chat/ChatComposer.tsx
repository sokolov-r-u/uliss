import {Icon} from '@uliss/design-system'
import {MicButton} from './MicButton'

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
        <form
            className="chat-composer"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            <div className="chat-dock">
                <input
                    type="text"
                    className="chat-dock-input"
                    placeholder="Reply by voice or text…"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
                <MicButton/>
                <button
                    type="submit"
                    className="composer-tile composer-tile-send"
                    disabled={disabled || value.trim() === ''}
                    aria-label="Send"
                >
                    <Icon name="arrowUp" size={18}/>
                </button>
            </div>
        </form>
    )
}
