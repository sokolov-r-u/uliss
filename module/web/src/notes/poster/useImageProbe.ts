import {useEffect, useState} from 'react'

export type ImageProbe =
    | { status: 'idle' }
    | { status: 'loading'; src: string }
    | { status: 'loaded'; src: string; width: number; height: number }
    | { status: 'error'; src: string }

/**
 * Loads [src] in the browser, as the poster frame will, to learn whether it is an image and its real size. Nothing goes
 * through the server; the browser's cache then serves the frame the same image.
 */
export function useImageProbe(src: string | null): ImageProbe {
    const [probe, setProbe] = useState<ImageProbe>({status: 'idle'})
    useEffect(() => {
        if (!src) {
            setProbe({status: 'idle'})
            return
        }
        setProbe({status: 'loading', src})
        const image = new Image()
        image.referrerPolicy = 'no-referrer'
        image.decoding = 'async'
        image.onload = () => setProbe({status: 'loaded', src, width: image.naturalWidth, height: image.naturalHeight})
        image.onerror = () => setProbe({status: 'error', src})
        image.src = src
        return () => {
            image.onload = null
            image.onerror = null
        }
    }, [src])
    return probe
}
