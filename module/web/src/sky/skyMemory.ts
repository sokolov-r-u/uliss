import type {SkyView} from './skyModel'

/**
 * How the sky looked when the user left it, kept for the life of the tab: coming back from a note or a chat (Back)
 * opens the same view, focus, filter, panel, framing and star positions. A reload starts afresh; ids that are gone
 * by then are dropped by the screen.
 */
export interface SkyScreenMemory {
    view: SkyView | null
    focusId: string | null
    lastFocus: string | null
    depth: number
    filter: string | null
    starId: string | null
    settingsOpen: boolean
}

export interface SkyCanvasMemory {
    viewBox: { s: number; tx: number; ty: number }
    fitScale: number
    /** The user has moved the view, so it no longer frames itself. */
    touched: boolean
    positions: Map<string, { x: number; y: number }>
}

export const skyMemory: { screen: SkyScreenMemory | null; canvas: SkyCanvasMemory | null } = {screen: null, canvas: null}
