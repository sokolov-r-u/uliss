import {beforeEach, describe, expect, it} from 'vitest'
import {clearTokens, getTokens, setTokens} from './tokenStore'

describe('clearTokens', () => {
    beforeEach(() => sessionStorage.clear())

    it("drops the tokens and the user's unsent chat turns and summary requests, nothing else", () => {
        setTokens({accessToken: 'a', refreshToken: 'r', expiresAt: 1, idToken: 'i'})
        sessionStorage.setItem('uliss.chat-initial-turn.v1', 'half a thought')
        sessionStorage.setItem('uliss.chat-summary.v1:c2', '{}')
        sessionStorage.setItem('uliss.returnTo', '/notes')

        clearTokens()

        expect(getTokens()).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-initial-turn.v1')).toBeNull()
        expect(sessionStorage.getItem('uliss.chat-summary.v1:c2')).toBeNull()
        expect(sessionStorage.getItem('uliss.returnTo')).toBe('/notes')
    })

    it('reads a corrupt entry as no tokens', () => {
        sessionStorage.setItem('uliss.tokens', '{not json')
        expect(getTokens()).toBeNull()
    })
})
