import {useLocation, useNavigate} from 'react-router-dom'
import {IconButton} from '@uliss/design-system'

/**
 * The header's way back to the previous screen of the app (the sky, a list, another note), like the browser's Back.
 * Absent on a screen opened directly (a link, a reload of the first page): there is nowhere inside the app to go.
 */
export function BackButton() {
    const location = useLocation()
    const navigate = useNavigate()
    // the router keys the first entry of a session 'default'; every in-app navigation gets a key of its own
    if (location.key === 'default') return null
    return <span className="screen-head-back">
        <IconButton s={44} title="Back" onClick={() => navigate(-1)}><span aria-hidden className="screen-head-back-glyph">←</span></IconButton>
    </span>
}
