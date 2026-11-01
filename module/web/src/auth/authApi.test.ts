import fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
    clearLoginRetry,
    exchangeCode,
    login,
    LoginRejectedError,
    logout,
    RefreshFailedError,
    RefreshRejectedError,
    refreshTokens,
    retryLoginOnce,
    takeReturnTo,
} from './authApi'
import {getTokens, setTokens} from './tokenStore'

function respondWith(status: number, body = '{}') {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {status})))
}

describe('refreshTokens', () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each([400, 401])('reports a rejected refresh token for %i', async (status) => {
        respondWith(status)

        await expect(refreshTokens('refresh-1')).rejects.toBeInstanceOf(RefreshRejectedError)
    })

    it.each([503, 404, 429])('reports any other error status %i as a failure with its status, not a rejection', async (status) => {
        respondWith(status)

        const error = await refreshTokens('refresh-1').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(RefreshFailedError)
        expect((error as RefreshFailedError).status).toBe(status)
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

describe('takeReturnTo', () => {
    beforeEach(() => sessionStorage.clear())

    const returnTo = (saved: string) => {
        sessionStorage.setItem('uliss.returnTo', saved)
        return takeReturnTo()
    }

    it('returns an in-app path once, then home', () => {
        expect(returnTo('/notes/n1?tab=chats')).toBe('/notes/n1?tab=chats')
        expect(takeReturnTo()).toBe('/')
    })

    it.each(['//evil.example/x', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', 'notes',
        '/callback?code=c', '/signed-out'])('sends %s home', (saved) => {
        expect(returnTo(saved)).toBe('/')
    })

    it('never leaves the app, whatever was saved', () => {
        fc.assert(fc.property(fc.string(), (saved) => {
            const to = returnTo(saved)
            expect(new URL(to, 'https://in.app').origin).toBe('https://in.app')
            expect(to.startsWith('/')).toBe(true)
            expect(to.startsWith('//')).toBe(false)
        }))
    })
})

describe('logout', () => {
    beforeEach(() => sessionStorage.clear())
    afterEach(() => vi.unstubAllGlobals())

    it('revokes with the id token and returns the end-session address', async () => {
        const fetchMock = vi.fn(async () => new Response('{"redirectUrl":"https://auth/connect/logout?id_token_hint=i"}'))
        vi.stubGlobal('fetch', fetchMock)
        setTokens({accessToken: 'a', refreshToken: 'r', expiresAt: 1, idToken: 'i'})

        expect(await logout('r', 'i')).toBe('https://auth/connect/logout?id_token_hint=i')
        expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)))
            .toEqual({refreshToken: 'r', idToken: 'i'})
        expect(getTokens()).toBeNull()
    })

    it('still clears the tokens and has nowhere to go when the service is down', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('offline')
        }))
        setTokens({accessToken: 'a', refreshToken: 'r', expiresAt: 1})

        expect(await logout('r')).toBeNull()
        expect(getTokens()).toBeNull()
    })
})

describe('refreshTokens keeps the id token', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('when the refresh answer carries none', async () => {
        respondWith(200, '{"access_token":"a2","refresh_token":"r2","expires_in":900,"token_type":"Bearer"}')

        expect((await refreshTokens('r1', 'id-1')).idToken).toBe('id-1')
    })
})
