import {type KeyboardEvent, type PointerEvent, useEffect, useRef, useState} from 'react'
import {useMessages} from '../../i18n/LocaleContext'
import {Button} from '../actions/Button'
import {IconButton} from '../actions/IconButton'
import {Kicker} from '../brand/Kicker'
import {StepControl} from '../forms/StepControl'
import {
    clampFrame,
    type CropMode,
    cropImageStyle,
    defaultFrame,
    fromFractions,
    largestSize,
    type PixelFrame,
    type PosterCrop,
    smallestSize,
    toFractions,
    zoomPercent,
} from './posterCrop'
import {posterCropperMessages} from './PosterCropper.messages'

// Two crops of one poster image: the 2:3 frame the note panel shows and the
// round sky avatar. The active frame stands still in the middle of a square
// stage while the image moves and scales under it; the other frame shows as a
// dashed outline, so the two crops never surprise each other. Previews of both
// sit beside the stage. Every size is fixed, so a Dialog around it keeps its
// size between modes and states. No sliders: zoom is −/+, the wheel and pinch.

export type PosterCropperStatus = 'loading' | 'ready' | 'unavailable'

export interface PosterCropperProps {
    /** The poster image (https). */
    src: string
    /** `ready` once the host has loaded the image and knows its size. */
    status?: PosterCropperStatus
    /** The image's natural size in px; needed when `ready`. */
    imageWidth?: number
    imageHeight?: number
    mode: CropMode
    onModeChange: (mode: CropMode) => void
    /** Both frames in fractions of the image (`fitCrop` turns a stored or missing crop into one). */
    value: PosterCrop
    onChange: (value: PosterCrop) => void
    /** The note's title, shown beside the avatar on the sky preview. */
    title?: string
    /** Phone layout (280px stage, previews in a row, 44px controls). Defaults to the cropper's own width under 560px. */
    compact?: boolean
    /** Locks every control, e.g. while the crop is saved. */
    disabled?: boolean
}

const COMPACT_BELOW = 560
const WHEEL_STEP = 1.08
const BUTTON_STEP = 1.15
const KEY_STEP = 8
const KEY_STEP_LARGE = 32
// neutral until the sky's avatars take their constellation's colour
const RING = 'var(--accent-2)'

export function PosterCropper({
                                  src,
                                  status = 'ready',
                                  imageWidth = 0,
                                  imageHeight = 0,
                                  mode,
                                  onModeChange,
                                  value,
                                  onChange,
                                  title,
                                  compact: compactProp,
                                  disabled = false,
                              }: PosterCropperProps) {
    const t = useMessages(posterCropperMessages)
    const rootRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState<number | null>(null)
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const pinch = useRef<{ distance: number; size: number } | null>(null)
    const [dragging, setDragging] = useState(false)

    useEffect(() => {
        const root = rootRef.current
        if (!root || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        observer.observe(root)
        return () => observer.disconnect()
    }, [])

    const compact = compactProp ?? (width !== null && width < COMPACT_BELOW)
    const stage = compact ? Math.min(280, Math.floor(width ?? 280)) : 360
    const frameHeight = Math.round(stage * 0.9)
    const frameWidth = Math.round(frameHeight * 2 / 3)
    const circle = Math.round(stage * 0.8)
    const ready = status === 'ready' && imageWidth > 0 && imageHeight > 0
    const live = ready && !disabled
    const poster = mode === 'poster'

    const frames: Record<CropMode, PixelFrame> | null = ready ? {
        poster: fromFractions('poster', value.poster, imageWidth, imageHeight),
        avatar: fromFractions('avatar', value.avatar, imageWidth, imageHeight),
    } : null
    const active = frames?.[mode]
    // screen px per image px
    const scale = active ? (poster ? frameWidth : circle) / active.size : 1

    // the crop last sent up: several pointer or wheel events can arrive before the host renders it
    const latest = useRef(value)
    latest.current = value
    const current = () => fromFractions(mode, latest.current[mode], imageWidth, imageHeight)

    const set = (frame: PixelFrame) => {
        if (!live) return
        const kept = clampFrame(mode, frame, imageWidth, imageHeight)
        const next = {...latest.current, [mode]: toFractions(mode, kept, imageWidth, imageHeight)}
        latest.current = next
        onChange(next)
    }
    const moveBy = (dx: number, dy: number) => {
        if (!live) return
        const now = current()
        const nowScale = (poster ? frameWidth : circle) / now.size
        set({...now, cx: now.cx - dx / nowScale, cy: now.cy - dy / nowScale})
    }
    const zoomBy = (factor: number) => {
        if (!live) return
        const now = current()
        set({...now, size: now.size / factor})
    }

    // React's wheel listener is passive, so the page would scroll too
    const wheel = useRef(zoomBy)
    wheel.current = zoomBy
    useEffect(() => {
        const element = stageRef.current
        if (!element) return
        const listener = (event: WheelEvent) => {
            event.preventDefault()
            // a sideways swipe is not a zoom
            if (event.deltaY !== 0) wheel.current(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP)
        }
        element.addEventListener('wheel', listener, {passive: false})
        return () => element.removeEventListener('wheel', listener)
    }, [])

    const down = (event: PointerEvent<HTMLDivElement>) => {
        if (!live || !active) return
        pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
        event.currentTarget.setPointerCapture?.(event.pointerId)
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            pinch.current = {distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, size: active.size}
        }
        setDragging(true)
    }
    const move = (event: PointerEvent<HTMLDivElement>) => {
        const previous = pointers.current.get(event.pointerId)
        if (!previous || !active) return
        pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
        if (pointers.current.size >= 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()]
            const factor = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.current.distance
            set({...active, size: pinch.current.size / factor})
            return
        }
        moveBy(event.clientX - previous.x, event.clientY - previous.y)
    }
    const up = (event: PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(event.pointerId)
        if (pointers.current.size < 2) pinch.current = null
        if (pointers.current.size === 0) setDragging(false)
    }
    const key = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!live) return
        const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
        }
        if (moves[event.key]) {
            event.preventDefault()
            moveBy(...moves[event.key])
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoomBy(BUTTON_STEP)
        } else if (event.key === '-') {
            event.preventDefault()
            zoomBy(1 / BUTTON_STEP)
        }
    }

    const imageLeft = active ? stage / 2 - active.cx * scale : 0
    const imageTop = active ? stage / 2 - active.cy * scale : 0
    const other = frames && (poster ? frames.avatar : frames.poster)
    const otherHeight = other ? (poster ? other.size : other.size * 1.5) : 0
    const atLargest = !active || active.size >= largestSize(mode, imageWidth, imageHeight) - 0.5
    const atSmallest = !active || active.size <= smallestSize(mode, imageWidth, imageHeight) + 0.5
    const buttonSize = compact ? 44 : 36
    const previewWidth = compact ? 64 : 120
    const avatarSize = compact ? 48 : 72
    const skyWidth = compact ? 120 : 160
    const skyHeight = compact ? 64 : 84
    const avatarX = Math.round(skyWidth * 0.55)
    const avatarY = Math.round(skyHeight * 0.5)

    return (
        <div ref={rootRef} style={{
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontFamily: 'var(--font-text)',
            color: 'var(--cream)',
        }}>
            <StepControl label={t.frame} value={mode} disabled={disabled}
                         steps={[{id: 'poster', label: t.panel}, {id: 'avatar', label: t.avatar}]}
                         onPick={(id) => onModeChange(id as CropMode)}/>
            <div style={{
                display: 'flex',
                flexDirection: compact ? 'column' : 'row',
                gap: compact ? 14 : 28,
                alignItems: 'flex-start',
            }}>
                <div
                    ref={stageRef}
                    role="group"
                    tabIndex={live ? 0 : -1}
                    aria-label={poster ? t.stagePanel : t.stageAvatar}
                    aria-disabled={!live || undefined}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={up}
                    onKeyDown={key}
                    style={{
                        position: 'relative',
                        flex: '0 0 auto',
                        width: stage,
                        height: stage,
                        overflow: 'hidden',
                        background: 'var(--bg-deep)',
                        touchAction: 'none',
                        userSelect: 'none',
                        cursor: live ? (dragging ? 'grabbing' : 'grab') : 'default',
                    }}
                >
                    {ready && active && (
                        <>
                            <img src={src} alt="" draggable={false} referrerPolicy="no-referrer" style={{
                                position: 'absolute',
                                left: imageLeft,
                                top: imageTop,
                                width: imageWidth * scale,
                                height: imageHeight * scale,
                                maxWidth: 'none',
                                pointerEvents: 'none',
                            }}/>
                            {other && (
                                <span aria-hidden="true" style={{
                                    position: 'absolute',
                                    left: imageLeft + (other.cx - other.size / 2) * scale,
                                    top: imageTop + (other.cy - otherHeight / 2) * scale,
                                    width: other.size * scale,
                                    height: otherHeight * scale,
                                    boxSizing: 'border-box',
                                    border: '1px dashed var(--cream-dim)',
                                    borderRadius: poster ? '50%' : 0,
                                    opacity: 0.55,
                                    pointerEvents: 'none',
                                }}/>
                            )}
                            <span aria-hidden="true" style={{
                                position: 'absolute',
                                left: (stage - (poster ? frameWidth : circle)) / 2,
                                top: (stage - (poster ? frameHeight : circle)) / 2,
                                width: poster ? frameWidth : circle,
                                height: poster ? frameHeight : circle,
                                boxSizing: 'border-box',
                                border: '1px solid var(--accent-2)',
                                borderRadius: poster ? 0 : '50%',
                                boxShadow: '0 0 0 999px var(--scrim)',
                                pointerEvents: 'none',
                            }}/>
                        </>
                    )}
                    {!ready && (
                        <span aria-busy={status === 'loading'} style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 16,
                            textAlign: 'center',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: status === 'unavailable' ? 'var(--cream-dim)' : 'var(--text-faint)',
                        }}>{status === 'unavailable' ? t.unavailable : t.loading}</span>
                    )}
                </div>
                <div style={{display: 'flex', flexDirection: compact ? 'row' : 'column', gap: 16, minWidth: 0}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        <Kicker size={9} spacing="2.5px" color={poster ? 'var(--accent-2)' : 'var(--text-muted)'}>
                            {t.panel}
                        </Kicker>
                        <div style={{
                            position: 'relative',
                            width: previewWidth,
                            height: previewWidth * 1.5,
                            overflow: 'hidden',
                            background: 'var(--bg-deep)',
                            outline: '1px solid var(--line)',
                        }}>
                            {ready && <img src={src} alt={t.posterPreview} referrerPolicy="no-referrer"
                                           style={cropImageStyle(value.poster)}/>}
                        </div>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        <Kicker size={9} spacing="2.5px" color={poster ? 'var(--text-muted)' : 'var(--accent-2)'}>
                            {t.avatar}
                        </Kicker>
                        <div aria-hidden="true" style={{
                            position: 'relative',
                            width: skyWidth,
                            height: skyHeight,
                            overflow: 'hidden',
                            background: 'var(--sky-bg, var(--bg-deep))',
                        }}>
                            {[[18, 22, 4], [30, skyHeight - 18, 5], [skyWidth - 22, 16, 4]].map(([x, y, d]) => (
                                <span key={`${x}-${y}`} style={{
                                    position: 'absolute', left: x, top: y, width: d, height: d,
                                    borderRadius: '50%', background: RING,
                                }}/>
                            ))}
                            <span style={{
                                position: 'absolute', left: avatarX - 16, top: avatarY - 16, width: 32, height: 32,
                                borderRadius: '50%', background: RING, opacity: 0.14,
                            }}/>
                            <span style={{
                                position: 'absolute', left: avatarX - 10, top: avatarY - 10, width: 20, height: 20,
                                boxSizing: 'border-box', borderRadius: '50%', overflow: 'hidden',
                                border: `var(--avatar-ring-width) solid ${RING}`,
                            }}>
                                {ready && <img src={src} alt="" referrerPolicy="no-referrer"
                                               style={cropImageStyle(value.avatar)}/>}
                            </span>
                            {title && <span style={{
                                position: 'absolute', left: avatarX + 15, top: avatarY - 6, maxWidth: skyWidth - avatarX - 17,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--cream)',
                            }}>{title}</span>}
                        </div>
                        <div style={{
                            position: 'relative',
                            width: avatarSize,
                            height: avatarSize,
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: 'var(--bg-deep)',
                            border: `var(--avatar-ring-width) solid ${RING}`,
                        }}>
                            {ready && <img src={src} alt={t.avatarPreview} referrerPolicy="no-referrer"
                                           style={cropImageStyle(value.avatar)}/>}
                        </div>
                    </div>
                </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 4, width: stage, maxWidth: '100%'}}>
                <IconButton s={buttonSize} title={t.zoomOut} disabled={!live || atLargest}
                            onClick={() => zoomBy(1 / BUTTON_STEP)}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none"
                         stroke="currentColor"><path d="M2 7h10"/></svg>
                </IconButton>
                <span aria-live="polite" style={{
                    minWidth: 48, textAlign: 'center', fontSize: 11, letterSpacing: '0.6px', color: 'var(--cream-dim)',
                }}>{active ? `${zoomPercent(mode, active, imageWidth, imageHeight)}%` : '—'}</span>
                <IconButton s={buttonSize} title={t.zoomIn} disabled={!live || atSmallest}
                            onClick={() => zoomBy(BUTTON_STEP)}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none"
                         stroke="currentColor"><path d="M2 7h10M7 2v10"/></svg>
                </IconButton>
                <span style={{flex: 1}}/>
                <Button variant="ghost" size={compact ? 'lg' : 'md'} disabled={!live}
                        onClick={() => set(defaultFrame(mode, imageWidth, imageHeight))}>{t.reset}</Button>
            </div>
            <p style={{margin: 0, fontSize: 11, lineHeight: '16px', minHeight: 32, color: 'var(--text-faint)'}}>
                {compact ? t.helpTouch : t.help}
            </p>
        </div>
    )
}
