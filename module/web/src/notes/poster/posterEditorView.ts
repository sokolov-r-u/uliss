import type {FieldMessageTone, PosterFrameState} from '@uliss/design-system'
import {type PosterLinkCheck, POSTER_MIN_SIDE} from './posterLink'
import type {ImageProbe} from './useImageProbe'
import type {notePosterMessages} from './notePoster.messages'

/** What the poster editor shows for a typed link and the browser's attempt to load it. */
export interface PosterEditorView {
    frame: PosterFrameState
    message: [string, FieldMessageTone]
    invalid: boolean
    /** The image loaded and is big enough: it may be saved. */
    ready: boolean
    /** `small`: the image's real size. */
    badge?: string
}

export function posterEditorView(
    check: PosterLinkCheck['kind'],
    probe: ImageProbe,
    t: (typeof notePosterMessages)['en'],
): PosterEditorView {
    const refused = (text: string): PosterEditorView => ({
        frame: 'hint', message: [text, 'error'], invalid: true, ready: false,
    })
    if (check === 'empty') return {frame: 'hint', message: [t.hint, 'hint'], invalid: false, ready: false}
    if (check === 'not-https') return refused(t.httpsOnly)
    if (check === 'credentials') return refused(t.credentials)
    if (check === 'too-long') return refused(t.tooLong)
    if (probe.status === 'error') {
        return {frame: 'broken', message: [t.couldNotLoad, 'error'], invalid: true, ready: false}
    }
    if (probe.status !== 'loaded') return {frame: 'loading', message: [t.loading, 'busy'], invalid: false, ready: false}
    const {width, height} = probe
    if (Math.min(width, height) < POSTER_MIN_SIDE) {
        return {
            frame: 'small', message: [t.tooSmall(width, height, POSTER_MIN_SIDE), 'error'], invalid: true, ready: false,
            badge: `${width} × ${height}`,
        }
    }
    return {frame: 'image', message: [t.fits(width, height), 'ok'], invalid: false, ready: true}
}
