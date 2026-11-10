import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {
    avatarImageBox,
    clampFrame,
    CROP_MIN_PX,
    type CropFrame,
    type CropMode,
    defaultCrop,
    fitCrop,
    fromFractions,
    largestSize,
    smallestSize,
    toFractions,
    zoomPercent,
} from './posterCrop'

const side = fc.integer({min: 20, max: 6000})
const mode = fc.constantFrom<CropMode>('poster', 'avatar')
const anything = fc.double({min: -1e5, max: 1e5, noNaN: true})
const fraction = fc.double({min: 0, max: 1, noNaN: true})

const inside = (frame: CropFrame) =>
    frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0 && frame.x + frame.w <= 1 && frame.y + frame.h <= 1

describe('posterCrop', () => {
    it('clamps any frame inside the image and the zoom limits', () => {
        fc.assert(fc.property(mode, side, side, anything, anything, anything, (m, w, h, cx, cy, size) => {
            const frame = clampFrame(m, {cx, cy, size}, w, h)
            const height = m === 'poster' ? frame.size * 1.5 : frame.size

            expect(frame.size).toBeLessThanOrEqual(largestSize(m, w, h) + 1e-9)
            expect(frame.size).toBeGreaterThanOrEqual(smallestSize(m, w, h) - 1e-9)
            expect(frame.cx - frame.size / 2).toBeGreaterThanOrEqual(-1e-9)
            expect(frame.cx + frame.size / 2).toBeLessThanOrEqual(w + 1e-9)
            expect(frame.cy - height / 2).toBeGreaterThanOrEqual(-1e-9)
            expect(frame.cy + height / 2).toBeLessThanOrEqual(h + 1e-9)
        }))
    })

    it('zooms at most 4× and never under 150 image px, unless the image is smaller', () => {
        fc.assert(fc.property(mode, side, side, (m, w, h) => {
            const largest = largestSize(m, w, h)
            const smallest = smallestSize(m, w, h)

            expect(largest / smallest).toBeLessThanOrEqual(4 + 1e-9)
            expect(smallest).toBe(Math.min(largest, Math.max(largest / 4, CROP_MIN_PX)))
        }))
        expect(smallestSize('avatar', 4000, 3000)).toBe(750)
        expect(smallestSize('avatar', 400, 300)).toBe(150)
        expect(smallestSize('avatar', 120, 100)).toBe(100)
    })

    it('stores a clamped frame as fractions the server accepts, and reads it back to the same frame', () => {
        fc.assert(fc.property(mode, side, side, anything, anything, anything, (m, w, h, cx, cy, size) => {
            const frame = clampFrame(m, {cx, cy, size}, w, h)
            const stored = toFractions(m, frame, w, h)
            const back = fromFractions(m, stored, w, h)

            expect(inside(stored)).toBe(true)
            expect(back.size).toBeCloseTo(frame.size, 1)
            expect(back.cx).toBeCloseTo(frame.cx, 1)
            expect(back.cy).toBeCloseTo(frame.cy, 1)
        }))
    })

    it('fits any stored crop — another image behind the link included — to a valid one', () => {
        const frame = fc.record({x: fraction, y: fraction, w: fraction, h: fraction})
        fc.assert(fc.property(side, side, frame, frame, (w, h, poster, avatar) => {
            const fitted = fitCrop({poster, avatar}, w, h)

            expect(inside(fitted.poster)).toBe(true)
            expect(inside(fitted.avatar)).toBe(true)
            expect(fitted.poster.h * h).toBeCloseTo(fitted.poster.w * w * 1.5, 0)
            expect(fitted.avatar.h * h).toBeCloseTo(fitted.avatar.w * w, 0)
        }))
    })

    it('defaults to the largest centred 2:3 frame and the circle as wide as the shorter side', () => {
        expect(defaultCrop(1000, 600)).toEqual({
            poster: {x: 0.3, y: 0, w: 0.4, h: 1},
            avatar: {x: 0.2, y: 0, w: 0.6, h: 1},
        })
        expect(fitCrop(null, 1000, 600)).toEqual(defaultCrop(1000, 600))
        expect(zoomPercent('avatar', {cx: 500, cy: 300, size: 300}, 1000, 600)).toBe(200)
    })

    it('places the image so the avatar frame fills exactly the circle\'s square, or its centre without a frame', () => {
        const frame = fc.record({x: fraction, y: fraction, w: fc.double({min: 0.01, max: 1, noNaN: true}),
            h: fc.double({min: 0.01, max: 1, noNaN: true})})
            .filter((f) => f.x + f.w <= 1 && f.y + f.h <= 1)
        const at = fc.double({min: -1000, max: 1000, noNaN: true})
        const radius = fc.double({min: 1, max: 40, noNaN: true})
        fc.assert(fc.property(frame, at, at, radius, (crop, cx, cy, r) => {
            const box = avatarImageBox(crop, cx, cy, r)

            expect(box.x + crop.x * box.width).toBeCloseTo(cx - r, 6)
            expect(box.x + (crop.x + crop.w) * box.width).toBeCloseTo(cx + r, 6)
            expect(box.y + crop.y * box.height).toBeCloseTo(cy - r, 6)
            expect(box.y + (crop.y + crop.h) * box.height).toBeCloseTo(cy + r, 6)
        }))
        expect(avatarImageBox(null, 50, 40, 10)).toEqual({x: 40, y: 30, width: 20, height: 20})
    })
})
