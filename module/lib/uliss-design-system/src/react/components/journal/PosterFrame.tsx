import type {SyntheticEvent} from 'react'
import {useMessages} from '../../i18n/LocaleContext'
import {type CropFrame, cropImageStyle} from './posterCrop'
import {posterFrameMessages} from './PosterFrame.messages'

// The fixed 2:3 frame of a note poster, full width of its container up to
// --poster-max-h tall (wider containers centre it). The image fills it
// (object-fit: cover, centred), so a preview is exactly what is saved. Every
// state keeps the same box: empty, loading and broken frames never collapse.

export type PosterFrameState = 'hint' | 'loading' | 'image' | 'small' | 'broken' | 'unavailable'

export interface PosterFrameProps {
    state: PosterFrameState
    /** The image (https), shown in `image` and `small`. */
    src?: string
    alt?: string
    /** The `hint` text; defaults to "Paste an https link to an image". */
    hint?: string
    /** `unavailable`: the link's host under the message. */
    host?: string
    /** `small`: the real size, e.g. "120 × 180". */
    badge?: string
    /** `image`: the part of the image to show (`PosterCrop.poster`); none shows it centred (cover). */
    crop?: CropFrame
    onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
    onImageError?: () => void
}

export function PosterFrame({state, src, alt = '', hint, host, badge, crop, onImageLoad, onImageError}: PosterFrameProps) {
    const t = useMessages(posterFrameMessages)
    const hasImage = (state === 'image' || state === 'small') && !!src
    const text = state === 'hint' ? (hint ?? t.hint)
        : state === 'loading' ? t.loading
            : state === 'broken' ? t.broken
                : state === 'unavailable' ? t.unavailable : null
    const glyph = state === 'broken' || state === 'unavailable'
    return (
        <figure
            aria-busy={state === 'loading'}
            style={{
                margin: '0 auto',
                position: 'relative',
                width: '100%',
                maxWidth: 'var(--poster-max-w)',
                aspectRatio: 'var(--poster-aspect)',
                boxSizing: 'border-box',
                overflow: 'hidden',
                background: 'var(--poster-empty)',
                border: `1px solid ${hasImage ? 'var(--line)' : 'var(--line-strong)'}`,
                fontFamily: 'var(--font-text)',
            }}
        >
            {hasImage && (
                <img
                    src={src}
                    alt={alt}
                    referrerPolicy="no-referrer"
                    decoding="async"
                    onLoad={onImageLoad}
                    onError={onImageError}
                    style={crop && state === 'image' ? cropImageStyle(crop) : {
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        opacity: state === 'small' ? 0.45 : 1,
                    }}
                />
            )}
            {text && (
                <figcaption
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        padding: 16,
                        boxSizing: 'border-box',
                        textAlign: 'center',
                    }}
                >
                    {glyph && (
                        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" style={{color: 'var(--text-faint)'}}>
                            <rect x="3.5" y="4.5" width="17" height="15"/>
                            <path d="M3.5 16l5-5 4 4 3-3 5 5"/>
                            <path d="M4 21L20 3"/>
                        </svg>
                    )}
                    {state === 'loading' && (
                        <span aria-hidden="true" style={{display: 'flex', gap: 6}}>
                            {[0.9, 0.55, 0.25].map((opacity) => (
                                <i key={opacity} style={{width: 5, height: 5, background: 'var(--accent-2)', opacity}}/>
                            ))}
                        </span>
                    )}
                    <span style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        maxWidth: 200,
                        color: state === 'unavailable' ? 'var(--cream-dim)' : 'var(--text-faint)',
                    }}>{text}</span>
                    {state === 'unavailable' && host && (
                        <span style={{
                            fontSize: 10,
                            letterSpacing: '0.5px',
                            color: 'var(--text-faint)',
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{host}</span>
                    )}
                </figcaption>
            )}
            {state === 'small' && badge && (
                <span style={{
                    position: 'absolute',
                    left: 8,
                    bottom: 8,
                    padding: '3px 6px',
                    background: 'var(--bg-deep)',
                    color: 'var(--terracotta)',
                    fontSize: 10,
                    letterSpacing: '0.6px',
                }}>{badge}</span>
            )}
        </figure>
    )
}
