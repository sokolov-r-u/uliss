import {useEffect, useSyncExternalStore} from 'react'

/**
 * Loads the sky's poster avatars after the stars, at the lowest priority and a few at a time. Each link is loaded once
 * per tab: a loaded one is drawn straight away when the sky comes back, a failed one stays a star until the page
 * reloads. The image is loaded here (an SVG `<image>` has no referrer policy or fetch priority); the sky's `<image>`
 * then takes it from the browser's cache.
 */
export type AvatarStatus = 'loading' | 'ready' | 'failed'

/** How many images load at once. */
export const AVATAR_CONCURRENCY = 3

const statuses = new Map<string, AvatarStatus>()
/** Loaded images stay referenced, so the browser keeps them decoded for the sky's `<image>`. */
const loaded = new Map<string, HTMLImageElement>()
const queue: string[] = []
const listeners = new Set<() => void>()
let active = 0
let version = 0
/** Bumped by a reset, so an image started before it never counts against the new queue. */
let generation = 0

function notify() {
    version++
    listeners.forEach((listener) => listener())
}

function start(url: string) {
    active++
    const started = generation
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    image.fetchPriority = 'low'
    image.decoding = 'async'
    const done = (status: AvatarStatus) => {
        if (started !== generation) return
        active--
        statuses.set(url, status)
        if (status === 'ready') loaded.set(url, image)
        notify()
        pump()
    }
    image.onload = () => done('ready')
    image.onerror = () => done('failed')
    image.src = url
}

function pump() {
    while (active < AVATAR_CONCURRENCY && queue.length > 0) start(queue.shift()!)
}

/** Queues every link not seen yet in this tab. */
export function loadAvatars(urls: Iterable<string>): void {
    let added = false
    for (const url of urls) {
        if (statuses.has(url)) continue
        statuses.set(url, 'loading')
        queue.push(url)
        added = true
    }
    if (added) notify()
    pump()
}

/** Drops the links not started yet, so turning posters off sends no more requests; started ones finish. */
export function stopAvatars(): void {
    if (queue.length === 0) return
    queue.splice(0).forEach((url) => statuses.delete(url))
    notify()
}

/** A drawn avatar whose image did not come from the cache after all: the sky draws its star again. */
export function failAvatar(url: string): void {
    if (statuses.get(url) === 'failed') return
    statuses.set(url, 'failed')
    loaded.delete(url)
    notify()
}

export function avatarStatus(url: string): AvatarStatus | undefined {
    return statuses.get(url)
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/**
 * Loads [urls] once [enabled] (after the frame that first draws the sky) and re-renders the caller as each one
 * settles; the returned number changes with every settled image.
 */
export function useAvatars(urls: readonly string[], enabled: boolean): number {
    const key = urls.join('\n')
    useEffect(() => {
        if (!enabled) {
            stopAvatars()
            return
        }
        // the stars are drawn first; the images wait for the next frame and then queue behind any other request
        let timer: ReturnType<typeof setTimeout> | undefined
        const frame = requestAnimationFrame(() => {
            timer = setTimeout(() => loadAvatars(key === '' ? [] : key.split('\n')), 0)
        })
        return () => {
            cancelAnimationFrame(frame)
            clearTimeout(timer)
        }
    }, [key, enabled])
    return useSyncExternalStore(subscribe, () => version)
}

/** Forgets every link; tests only. */
export function resetAvatarsForTest(): void {
    statuses.clear()
    loaded.clear()
    queue.length = 0
    active = 0
    generation++
    notify()
}
