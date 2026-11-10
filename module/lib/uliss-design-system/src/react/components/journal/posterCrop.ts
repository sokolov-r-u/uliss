import type {CSSProperties} from 'react'

// The geometry of a poster's two crops. A crop is stored in fractions of the
// image (0..1), so it holds for any resolution; the cropper works in image
// pixels. The 2:3 panel frame and the sky avatar's circle (stored as the square
// around it) are cut from the same image.

/** A rectangle in fractions of the image's width (`x`, `w`) and height (`y`, `h`). */
export interface CropFrame {
    x: number
    y: number
    w: number
    h: number
}

/** Where the panel's 2:3 frame and the sky avatar's circle sit on the poster image. */
export interface PosterCrop {
    poster: CropFrame
    avatar: CropFrame
}

export type CropMode = 'poster' | 'avatar'

/** A frame in image pixels: its centre and its width (poster, height = 1.5 × width) or diameter (avatar). */
export interface PixelFrame {
    cx: number
    cy: number
    size: number
}

/** The poster frame's height over its width (2:3). */
export const POSTER_FRAME_RATIO = 1.5
/** The smallest frame in image pixels, so a crop never shows a blurry scrap. */
export const CROP_MIN_PX = 150
/** The deepest zoom over the whole-image frame. */
export const CROP_MAX_ZOOM = 4

const heightOf = (mode: CropMode, size: number) => mode === 'poster' ? size * POSTER_FRAME_RATIO : size

/** The largest frame that fits the image: its default size and zoom 100%. */
export function largestSize(mode: CropMode, imageWidth: number, imageHeight: number): number {
    return mode === 'poster'
        ? Math.min(imageWidth, imageHeight / POSTER_FRAME_RATIO)
        : Math.min(imageWidth, imageHeight)
}

/** The smallest frame: a quarter of the largest, but never under [CROP_MIN_PX] nor over the largest. */
export function smallestSize(mode: CropMode, imageWidth: number, imageHeight: number): number {
    const largest = largestSize(mode, imageWidth, imageHeight)
    return Math.min(largest, Math.max(largest / CROP_MAX_ZOOM, CROP_MIN_PX))
}

/** The largest frame in the middle of the image — what an uncropped poster shows (cover, centred). */
export function defaultFrame(mode: CropMode, imageWidth: number, imageHeight: number): PixelFrame {
    return {cx: imageWidth / 2, cy: imageHeight / 2, size: largestSize(mode, imageWidth, imageHeight)}
}

/** [frame] with its size within the zoom limits and the whole frame inside the image. */
export function clampFrame(mode: CropMode, frame: PixelFrame, imageWidth: number, imageHeight: number): PixelFrame {
    const size = Math.min(largestSize(mode, imageWidth, imageHeight),
        Math.max(smallestSize(mode, imageWidth, imageHeight), frame.size))
    const half = size / 2
    const halfHeight = heightOf(mode, size) / 2
    return {
        size,
        cx: Math.min(imageWidth - half, Math.max(half, frame.cx)),
        cy: Math.min(imageHeight - halfHeight, Math.max(halfHeight, frame.cy)),
    }
}

/** How far [frame] is zoomed over the largest frame, in whole percent (100 = the whole image). */
export function zoomPercent(mode: CropMode, frame: PixelFrame, imageWidth: number, imageHeight: number): number {
    return Math.round(largestSize(mode, imageWidth, imageHeight) / frame.size * 100)
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/** The start and length of a frame on one axis in fractions, rounded, with start + length never past 1. */
function axis(start: number, length: number, imageLength: number): [number, number] {
    const size = Math.min(1, round6(length / imageLength))
    let from = Math.max(0, round6(start / imageLength))
    if (from + size > 1) from = Math.max(0, 1 - size)
    // 1 - size + size can land a hair above 1 in floating point
    while (from > 0 && from + size > 1) from = Math.max(0, from - 1e-9)
    return [from, size]
}

/** [frame] in fractions of the image, as stored: inside 0..1 with `x + w <= 1` and `y + h <= 1`. */
export function toFractions(mode: CropMode, frame: PixelFrame, imageWidth: number, imageHeight: number): CropFrame {
    const height = heightOf(mode, frame.size)
    const [x, w] = axis(frame.cx - frame.size / 2, frame.size, imageWidth)
    const [y, h] = axis(frame.cy - height / 2, height, imageHeight)
    return {x, y, w, h}
}

/**
 * A stored [crop] frame in image pixels, kept inside the image and the zoom limits. The width and the centre are
 * trusted; a height that does not match the image's proportions (the link now serves another image) is ignored.
 */
export function fromFractions(mode: CropMode, crop: CropFrame, imageWidth: number, imageHeight: number): PixelFrame {
    return clampFrame(mode, {
        cx: (crop.x + crop.w / 2) * imageWidth,
        cy: (crop.y + crop.h / 2) * imageHeight,
        size: crop.w * imageWidth,
    }, imageWidth, imageHeight)
}

/** Both frames at their defaults. */
export function defaultCrop(imageWidth: number, imageHeight: number): PosterCrop {
    return {
        poster: toFractions('poster', defaultFrame('poster', imageWidth, imageHeight), imageWidth, imageHeight),
        avatar: toFractions('avatar', defaultFrame('avatar', imageWidth, imageHeight), imageWidth, imageHeight),
    }
}

/** [crop] fitted to this image — inside it and the zoom limits — or both defaults when there is none yet. */
export function fitCrop(crop: PosterCrop | null | undefined, imageWidth: number, imageHeight: number): PosterCrop {
    if (!crop) return defaultCrop(imageWidth, imageHeight)
    const fit = (mode: CropMode) =>
        toFractions(mode, fromFractions(mode, crop[mode], imageWidth, imageHeight), imageWidth, imageHeight)
    return {poster: fit('poster'), avatar: fit('avatar')}
}

/**
 * The style of an `<img>` inside a box (position: relative; overflow: hidden) that shows [crop] of it: the image is
 * scaled so the frame fills the box, in percent of the box, without knowing the image's size. `object-fit: cover`
 * keeps a frame whose proportions no longer match the image from stretching it.
 */
export function cropImageStyle(crop: CropFrame): CSSProperties {
    return {
        position: 'absolute',
        left: `${-crop.x / crop.w * 100}%`,
        top: `${-crop.y / crop.h * 100}%`,
        width: `${100 / crop.w}%`,
        height: `${100 / crop.h}%`,
        maxWidth: 'none',
        objectFit: 'cover',
    }
}
