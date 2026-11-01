import {beforeEach, describe, expect, it} from 'vitest'
import {claimChatState, clearSession, endSessionKeepingChatState, getTokens, setTokens, type Tokens} from './tokenStore'

const OWNER = 'uliss.chatOwner'
const TURN = 'uliss.chat-turn.v1:c1'

function tokensOf(sub: string): Tokens {
    return {accessToken: `h.${btoa(JSON.stringify({sub}))}.s`, refreshToken: 'r', expiresAt: 1}
}

describe('clearSession', () => {
    beforeEach(() => sessionStorage.clear())

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
        sessionStorage.setItem('uliss.tokens', '{not json')
        expect(getTokens()).toBeNull()
    })
})

describe('endSessionKeepingChatState', () => {
    beforeEach(() => sessionStorage.clear())

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
        sessionStorage.setItem(TURN, 'hello')
    })

    it('keeps the chat state for the user who left it', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        claimChatState(tokensOf('user-1'))

        expect(sessionStorage.getItem(TURN)).toBe('hello')
        expect(sessionStorage.getItem(OWNER)).toBeNull()
    })

    it('wipes the chat state when another user signs in', () => {
        sessionStorage.setItem(OWNER, 'user-1')

        claimChatState(tokensOf('user-2'))

        expect(sessionStorage.getItem(TURN)).toBeNull()
        expect(sessionStorage.getItem(OWNER)).toBeNull()
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
