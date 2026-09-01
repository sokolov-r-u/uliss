import {Icon} from '@uliss/design-system'

/**
 * The composer's inline mic tile (DS `ChatDock` shape). Always `disabled` — there is no
 * speech-to-text backend yet, so chat is text-only for now (product decision).
 */
export function MicButton() {
    return (
        <button type="button" className="composer-tile" disabled title="Voice input coming soon">
            <Icon name="mic" size={18}/>
        </button>
    )
}
