import {useState} from 'react'
import {PosterFrame, useMessages} from '@uliss/design-system'
import type {NotePoster} from '../noteApi'
import {posterHost} from './posterLink'
import {notePosterMessages} from './notePoster.messages'

/** A stored poster in its 2:3 frame, cropped as saved; a link that stopped loading shows as unavailable, with its site. */
export function SavedPoster({title, poster}: { title?: string; poster: NotePoster }) {
    const posterUrl = poster.url
    const t = useMessages(notePosterMessages)
    // a saved link that stopped loading; a new link starts over
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    return <PosterFrame state={failedUrl === posterUrl ? 'unavailable' : 'image'} src={posterUrl}
                        alt={title ? t.alt(title) : t.untitledAlt} host={posterHost(posterUrl)} crop={poster.crop?.poster}
                        onImageError={() => setFailedUrl(posterUrl)}/>
}
