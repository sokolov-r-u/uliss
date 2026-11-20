/**
 * Tells the other tabs of this browser that the user signed out. The tabs share the tokens, which the signing-out tab
 * removes itself; the others drop their own chat state and leave the screens of a session that is over.
 */
const CHANNEL = 'uliss.auth'
const SIGNED_OUT = 'signed-out'

// BroadcastChannel never delivers a message to the object that posted it, so one per tab is enough.
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)

export function announceSignOut(): void {
    channel?.postMessage(SIGNED_OUT)
}

/** Calls [onSignedOut] when another tab signs out; returns the unsubscribe. */
export function onSignOutElsewhere(onSignedOut: () => void): () => void {
    if (!channel) return () => undefined
    const listener = (event: MessageEvent) => {
        if (event.data === SIGNED_OUT) onSignedOut()
    }
    channel.addEventListener('message', listener)
    return () => channel.removeEventListener('message', listener)
}
