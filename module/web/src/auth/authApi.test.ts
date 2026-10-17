import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
    clearLoginRetry,
    exchangeCode,
    login,
    LoginRejectedError,
    RefreshRejectedError,
    refreshTokens,
    retryLoginOnce,
    takeReturnTo,
} from './authApi'

function respondWith(status: number, body = '{}') {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {status})))
}

describe('refreshTokens', () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each([400, 401])('reports a rejected refresh token for %i', async (status) => {
        respondWith(status)

        await expect(refreshTokens('refresh-1')).rejects.toBeInstanceOf(RefreshRejectedError)
    })

    it('reports a server failure as a plain error, not a rejection', async () => {
        respondWith(503)

        const error = await refreshTokens('refresh-1').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBeInstanceOf(RefreshRejectedError)
    })

    it('stores and returns the rotated tokens', async () => {
        respondWith(200, JSON.stringify({access_token: 'a', refresh_token: 'r', expires_in: 900, token_type: 'Bearer'}))

        const tokens = await refreshTokens('refresh-1')

        expect(tokens.accessToken).toBe('a')
        expect(tokens.refreshToken).toBe('r')
        expect(JSON.parse(sessionStorage.getItem('uliss.tokens') ?? 'null')?.accessToken).toBe('a')
    })
})

describe('exchangeCode', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('sends the code and the login state for verification', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({access_token: 'a', refresh_token: 'r', expires_in: 900, token_type: 'Bearer'})))
        vi.stubGlobal('fetch', fetchMock)

        await exchangeCode('code 1', 'state&1')

        expect(fetchMock).toHaveBeenCalledWith(
            '/user/oauth2/callback?code=code+1&state=state%261',
            expect.objectContaining({method: 'POST', credentials: 'include'}),
        )
    })

    it('reports a login session the service rejected (state, verifier, or code) as LoginRejectedError', async () => {
        respondWith(400)

        await expect(exchangeCode('code-1', 'state-1')).rejects.toBeInstanceOf(LoginRejectedError)
    })

    it('reports a server failure as a plain error, not a rejected login', async () => {
        respondWith(500)

        const error = await exchangeCode('code-1', 'state-1').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBeInstanceOf(LoginRejectedError)
    })
})

/** jsdom cannot navigate: a plain location records where `login()` sends the browser. */
function stubLocation(path: string) {
    const url = new URL(path, 'http://uliss.home')
    const location = {pathname: url.pathname, search: url.search, href: url.href}
    vi.stubGlobal('location', location)
    return location
}

describe('login', () => {
    beforeEach(() => sessionStorage.clear())
    afterEach(() => vi.unstubAllGlobals())

    it('remembers the current route and hands the login to the service', () => {
        const location = stubLocation('/notes/n1?tab=chats')

        login()

        expect(location.href).toBe('/user/oauth2/login')
        expect(takeReturnTo()).toBe('/notes/n1?tab=chats')
    })

    it('keeps the route of the login it restarts from the callback page', () => {
        stubLocation('/notes/n1')
        login()
        stubLocation('/callback?code=c1&state=s1')

        login()

        expect(takeReturnTo()).toBe('/notes/n1')
    })
})

describe('retryLoginOnce', () => {
    beforeEach(() => sessionStorage.clear())
    afterEach(() => vi.unstubAllGlobals())

    it('restarts the first rejected login and refuses the second, so a rejected login never loops', () => {
        const location = stubLocation('/callback?code=c1&state=s1')

        expect(retryLoginOnce()).toBe(true)
        expect(location.href).toBe('/user/oauth2/login')

        const retried = stubLocation('/callback?code=c2&state=s2')
        expect(retryLoginOnce()).toBe(false)
        expect(retried.href).toBe('http://uliss.home/callback?code=c2&state=s2')
    })

    it('allows one restart again once the refused retry has been reported', () => {
        stubLocation('/callback?code=c1&state=s1')
        retryLoginOnce()
        retryLoginOnce()

        expect(retryLoginOnce()).toBe(true)
    })

    it('allows one restart again after a completed login', () => {
        stubLocation('/callback?code=c1&state=s1')
        retryLoginOnce()

        clearLoginRetry()

        expect(retryLoginOnce()).toBe(true)
    })
})
