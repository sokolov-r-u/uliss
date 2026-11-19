import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    adoptStoredTokens,
    claimChatState,
    clearSession,
    endSessionKeepingChatState,
    getTokens,
    onOtherUserSignedIn,
    replaceTokens,
    setTokens,
    type Tokens,
} from './tokenStore'

const OWNER = 'uliss.chatOwner'
const TURN = 'uliss.chat-turn.v1:c1'

function tokensOf(sub: string): Tokens {
    return {accessToken: `h.${btoa(JSON.stringify({sub}))}.s`, refreshToken: 'r', expiresAt: 1}
}

describe('clearSession', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
    })

    it("drops the tokens and the user's unsent chat turns and summary requests, nothing else", () => {
        setTokens({accessToken: 'a', refreshToken: 'r', expiresAt: 1, idToken: 'i'})
        sessionStorage.setItem('uliss.chat-initial-turn.v1', 'half a thought')
        sessionStorage.setItem('uliss.chat-summary.v1:c2', '{}')
        sessionStorage.setItem('uliss.returnTo', '/notes')
        sessionStorage.setItem(OWNER, 'user-1')

        clearSession()

        expect(getTokens()).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-initial-turn.v1')).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-summary.v1:c2')).toBeNull()
        expect(sessionStorage.getItem('uliss.returnTo')).toBe('/notes')
        expect(sessionStorage.getItem(OWNER)).toBeNull()
    })

    it('reads a corrupt entry as no tokens', () => {
        localStorage.setItem('uliss.tokens', '{not json')
        expect(getTokens()).toBeNull()
    })
})

describe('endSessionKeepingChatState', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
    })

    it('drops the tokens and marks the chat state with their user', () => {
        setTokens(tokensOf('user-1'))
        sessionStorage.setItem(TURN, 'hello')

        endSessionKeepingChatState()

        expect(getTokens()).toBeNull()
        expect(sessionStorage.getItem(TURN)).toBe('hello')
        expect(sessionStorage.getItem(OWNER)).toBe('user-1')
    })

    it('keeps the owner already marked when there are no tokens to read a user from', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        endSessionKeepingChatState()

        expect(sessionStorage.getItem(OWNER)).toBe('user-1')
    })
})

describe('claimChatState', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        sessionStorage.setItem(TURN, 'hello')
    })

    it('keeps the chat state for the user who left it and marks the tab as theirs', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        claimChatState(tokensOf('user-1'))

        expect(sessionStorage.getItem(TURN)).toBe('hello')
        expect(sessionStorage.getItem(OWNER)).toBe('user-1')
    })

    it('wipes the chat state when another user signs in and marks the tab as theirs', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        claimChatState(tokensOf('user-2'))

        expect(sessionStorage.getItem(TURN)).toBeNull()
        expect(sessionStorage.getItem(OWNER)).toBe('user-2')
    })

    it('wipes chat state nobody claimed', () => {
        claimChatState(tokensOf('user-1'))

        expect(sessionStorage.getItem(TURN)).toBeNull()
    })

    it('wipes the chat state when the new token names no user', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        claimChatState({accessToken: 'not-a-jwt', refreshToken: 'r', expiresAt: 1})

        expect(sessionStorage.getItem(TURN)).toBeNull()
    })
})

describe('shared tokens', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
    })

    it('keeps the tokens in storage every tab of the browser reads', () => {
        setTokens(tokensOf('user-1'))

        expect(JSON.parse(localStorage.getItem('uliss.tokens') ?? 'null')).toEqual(tokensOf('user-1'))
        expect(sessionStorage.getItem('uliss.tokens')).toBeNull()
    })

    it('replaces the tokens only while the refresh token they rotate is still stored', () => {
        setTokens(tokensOf('user-1'))
        const rotated = {...tokensOf('user-1'), refreshToken: 'r2'}

        expect(replaceTokens('r', rotated)).toEqual(rotated)
        expect(replaceTokens('r', {...rotated, refreshToken: 'r3'})).toEqual(rotated)
        expect(getTokens()).toEqual(rotated)
    })

    it('stores nothing once the tokens are gone', () => {
        expect(replaceTokens('r', tokensOf('user-1'))).toBeNull()
        expect(getTokens()).toBeNull()
    })
})

describe('adoptStoredTokens', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        sessionStorage.setItem(TURN, 'hello')
    })

    it("wipes another user's chat state left in a restored tab and marks the tab with the stored user", () => {
        sessionStorage.setItem(OWNER, 'user-1')
        setTokens(tokensOf('user-2'))

        expect(adoptStoredTokens()).toBe(true)

        expect(sessionStorage.getItem(TURN)).toBeNull()
        expect(sessionStorage.getItem(OWNER)).toBe('user-2')
    })

    it("keeps the same user's chat state", () => {
        sessionStorage.setItem(OWNER, 'user-1')
        setTokens(tokensOf('user-1'))

        expect(adoptStoredTokens()).toBe(true)

        expect(sessionStorage.getItem(TURN)).toBe('hello')
    })

    it('leaves the chat state for the sign-in to decide when there are no tokens', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        expect(adoptStoredTokens()).toBe(false)

        expect(sessionStorage.getItem(TURN)).toBe('hello')
        expect(sessionStorage.getItem(OWNER)).toBe('user-1')
    })
})

describe('onOtherUserSignedIn', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        sessionStorage.setItem(TURN, 'hello')
        sessionStorage.setItem(OWNER, 'user-1')
    })

    /** What another tab's write looks like to this one. */
    function storedElsewhere(newValue: string | null, key = 'uliss.tokens') {
        window.dispatchEvent(new StorageEvent('storage', {key, newValue, storageArea: localStorage}))
    }

    it("wipes this tab's chat state and reports when another tab stores another user's tokens", () => {
        const onOtherUser = vi.fn()
        const unsubscribe = onOtherUserSignedIn(onOtherUser)

        storedElsewhere(JSON.stringify(tokensOf('user-2')))

        expect(onOtherUser).toHaveBeenCalledOnce()
        expect(sessionStorage.getItem(TURN)).toBeNull()
        unsubscribe()
    })

    it("ignores the same user's refresh, a sign-out and other keys", () => {
        const onOtherUser = vi.fn()
        const unsubscribe = onOtherUserSignedIn(onOtherUser)

        storedElsewhere(JSON.stringify(tokensOf('user-1')))
        storedElsewhere(null)
        storedElsewhere(JSON.stringify(tokensOf('user-2')), 'uliss.theme')

        expect(onOtherUser).not.toHaveBeenCalled()
        expect(sessionStorage.getItem(TURN)).toBe('hello')
        unsubscribe()
    })
})
