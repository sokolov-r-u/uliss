import {MicIcon} from '../ui/icons'

/** Always-disabled — no speech-to-text backend yet (text-only chat for now, per product decision). */
export function MicButton() {
    return (
        <button type="button" className="mic-button" disabled title="Voice input coming soon">
            <MicIcon/>
        </button>
    )
}
