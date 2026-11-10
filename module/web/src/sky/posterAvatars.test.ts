import {act, renderHook, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AVATAR_CONCURRENCY, avatarStatus, loadAvatars, resetAvatarsForTest, stopAvatars, useAvatars} from './posterAvatars'

/** A browser image that loads only when the test says so. */
class FakeImage {
    static made: FakeImage[] = []
    referrerPolicy = ''
    fetchPriority = ''
    decoding = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    src = ''

    constructor() {
        FakeImage.made.push(this)
    }
}

const started = () => FakeImage.made.map((image) => image.src)
const finish = (url: string, ok = true) => act(() => {
    const image = FakeImage.made.find((made) => made.src === url)!
    if (ok) image.onload?.()
    else image.onerror?.()
})
const urls = (n: number) => Array.from({length: n}, (_, i) => `https://example.com/${i}.jpg`)

describe('poster avatars', () => {
    beforeEach(() => {
        FakeImage.made = []
        vi.stubGlobal('Image', FakeImage)
        resetAvatarsForTest()
    })
    afterEach(() => vi.unstubAllGlobals())

    it('loads at most three at a time, at low priority and without a referrer, and starts the next as one ends', () => {
        loadAvatars(urls(5))

        expect(started()).toEqual(urls(5).slice(0, AVATAR_CONCURRENCY))
        expect(FakeImage.made.every((image) => image.referrerPolicy === 'no-referrer'
            && image.fetchPriority === 'low')).toBe(true)
        expect(avatarStatus(urls(5)[4])).toBe('loading')

        finish(urls(5)[0])
        finish(urls(5)[1], false)

        expect(avatarStatus(urls(5)[0])).toBe('ready')
        expect(avatarStatus(urls(5)[1])).toBe('failed')
        expect(started()).toEqual(urls(5))
    })

    it('loads a link once per tab: a loaded or failed one is never requested again', () => {
        loadAvatars(urls(2))
        finish(urls(2)[0])
        finish(urls(2)[1], false)

        loadAvatars(urls(2))

        expect(started()).toEqual(urls(2))
        expect(avatarStatus(urls(2)[0])).toBe('ready')
        expect(avatarStatus(urls(2)[1])).toBe('failed')
    })

    it('stopping drops the links not started yet; the started ones finish', () => {
        loadAvatars(urls(5))
        stopAvatars()
        finish(urls(5)[0])

        expect(started()).toEqual(urls(5).slice(0, 3))
        expect(avatarStatus(urls(5)[0])).toBe('ready')
        expect(avatarStatus(urls(5)[4])).toBeUndefined()

        // asked again, the dropped links queue once more behind the two still loading
        loadAvatars(urls(5))
        expect(started()).toEqual(urls(5).slice(0, 4))
        expect(avatarStatus(urls(5)[4])).toBe('loading')
    })

    it('the hook loads nothing while turned off, and after the next frame once on', async () => {
        const {rerender} = renderHook(({on}) => useAvatars(urls(2), on), {initialProps: {on: false}})
        await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
        expect(started()).toEqual([])

        rerender({on: true})
        expect(started()).toEqual([])
        await waitFor(() => expect(started()).toEqual(urls(2)))
    })

    it('the hook re-renders its owner as each image settles', async () => {
        const {result} = renderHook(() => useAvatars(urls(1), true))
        await waitFor(() => expect(started()).toEqual(urls(1)))
        const before = result.current

        finish(urls(1)[0])

        expect(result.current).not.toBe(before)
    })
})
