import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
    authFetch,
    AuthRequiredError,
    getAccessToken,
    onOnboardingRequired,
    refreshSession,
    SessionRefreshError,
    tokenRequiresOnboarding,
} from './apiClient'
import {login, RefreshRejectedError, refreshTokens} from './authApi'
import {getTokens, setTokens, type Tokens} from './tokenStore'

vi.mock('./authApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('./authApi')>(),
    login: vi.fn(),
    refreshTokens: vi.fn(),
}))

const fresh: Tokens = {accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: Date.now() + 15 * 60_000}
const expired: Tokens = {accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - 1000}

function okFor(token: string) {
    return (_path: RequestInfo | URL, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get('Authorization')
        return Promise.resolve(new Response('{}', {status: auth === `Bearer ${token}` ? 200 : 401}))
    }
}

describe('authFetch refresh', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.mocked(login).mockReset()
        vi.mocked(refreshTokens).mockReset().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            setTokens(fresh)
            return fresh
        })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('refreshes once for concurrent calls with an expired access token (rotating refresh tokens)', async () => {
        setTokens(expired)
        vi.stubGlobal('fetch', vi.fn(okFor('access-2')))

        const [a, b] = await Promise.all([authFetch('/note/chats'), authFetch('/note/notes')])

        expect(a.status).toBe(200)
        expect(b.status).toBe(200)
        expect(refreshTokens).toHaveBeenCalledOnce()
        expect(refreshTokens).toHaveBeenCalledWith('refresh-1')
        expect(login).not.toHaveBeenCalled()
    })

    it('reuses tokens another call already refreshed instead of spending the old refresh token', async () => {
        setTokens({accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000})
        // The server rejects access-1; meanwhile another tab/call has stored access-2.
        vi.stubGlobal('fetch', vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
            const auth = new Headers(init?.headers).get('Authorization')
            if (auth === 'Bearer access-1') {
                setTokens(fresh)
                return new Response('{}', {status: 401})
            }
            return okFor('access-2')(path, init)
        }))

        const res = await authFetch('/note/chats')

        expect(res.status).toBe(200)
        expect(refreshTokens).not.toHaveBeenCalled()
        expect(getTokens()?.accessToken).toBe('access-2')
    })

    it('keeps the session when refresh fails for a transient reason', async () => {
        setTokens(expired)
        vi.mocked(refreshTokens).mockRejectedValue(new TypeError('Failed to fetch'))
        vi.stubGlobal('fetch', vi.fn(okFor('access-2')))

        await expect(authFetch('/note/chats')).rejects.toBeInstanceOf(SessionRefreshError)

        expect(login).not.toHaveBeenCalled()
        expect(getTokens()).toEqual(expired)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('signs in again once when the service rejects the refresh token', async () => {
        setTokens(expired)
        vi.mocked(refreshTokens).mockRejectedValue(new RefreshRejectedError(401))
        vi.stubGlobal('fetch', vi.fn(okFor('access-2')))

        const results = await Promise.allSettled([authFetch('/note/chats'), authFetch('/note/notes')])

        for (const result of results) {
            expect(result.status).toBe('rejected')
            expect((result as PromiseRejectedResult).reason).toBeInstanceOf(AuthRequiredError)
        }
        expect(refreshTokens).toHaveBeenCalledOnce()
        expect(login).toHaveBeenCalledOnce()
        expect(getTokens()).toBeNull()
    })
})

describe('getAccessToken', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.mocked(login).mockReset()
        vi.mocked(refreshTokens).mockReset().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            setTokens(fresh)
            return fresh
        })
    })

    it('returns the stored access token while it is valid', async () => {
        setTokens(fresh)

        await expect(getAccessToken()).resolves.toBe('access-2')
        expect(refreshTokens).not.toHaveBeenCalled()
    })

    it('shares one refresh among concurrent callers', async () => {
        setTokens(expired)

        const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()])

        expect(tokens).toEqual(['access-2', 'access-2', 'access-2'])
        expect(refreshTokens).toHaveBeenCalledOnce()
    })

    it('sends the user to sign-in when there is no session', async () => {
        await expect(getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError)
        expect(login).toHaveBeenCalledOnce()
    })
})

describe('refreshSession', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.mocked(refreshTokens).mockReset().mockImplementation(async () => {
            setTokens({...fresh, accessToken: 'access-3'})
            return {...fresh, accessToken: 'access-3'}
        })
    })

    it('replaces a still valid access token, so new claims reach the services', async () => {
        setTokens(fresh)

        await refreshSession()

        expect(refreshTokens).toHaveBeenCalledWith('refresh-2')
        expect(getTokens()?.accessToken).toBe('access-3')
    })
    it('does not settle for a refresh that started before it was asked', async () => {
        setTokens(expired)
        let finishFirst: () => void = () => undefined
        vi.mocked(refreshTokens)
            .mockImplementationOnce(() => new Promise((resolve) => {
                finishFirst = () => {
                    setTokens(fresh)
                    resolve(fresh)
                }
            }))
            .mockImplementationOnce(async () => {
                setTokens({...fresh, accessToken: 'access-3'})
                return {...fresh, accessToken: 'access-3'}
            })

        const earlier = getAccessToken()
        const forced = refreshSession()
        finishFirst()
        await Promise.all([earlier, forced])

        expect(refreshTokens).toHaveBeenCalledTimes(2)
        expect(getTokens()?.accessToken).toBe('access-3')
    })
})

describe('tokenRequiresOnboarding', () => {
    beforeEach(() => sessionStorage.clear())

    function jwt(payload: object): string {
        const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
        return `${encode({alg: 'RS256'})}.${encode(payload)}.signature`
    }

    it('reads the onboarding claim of the access token', () => {
        setTokens({...fresh, accessToken: jwt({onboardingRequired: true})})

        expect(tokenRequiresOnboarding()).toBe(true)
    })

    it('is false without the claim, a session or a readable token', () => {
        expect(tokenRequiresOnboarding()).toBe(false)
        setTokens({...fresh, accessToken: jwt({userId: 'u'})})
        expect(tokenRequiresOnboarding()).toBe(false)
        setTokens({...fresh, accessToken: 'not-a-jwt'})
        expect(tokenRequiresOnboarding()).toBe(false)
    })
})

describe('onboarding required signal', () => {
    beforeEach(() => {
        sessionStorage.clear()
        setTokens(fresh)
    })
    afterEach(() => vi.unstubAllGlobals())

    function respond(status: number, body: unknown) {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {status})))
    }

    it('notifies listeners when a service refuses the user until onboarding is done', async () => {
        const listener = vi.fn()
        const unsubscribe = onOnboardingRequired(listener)
        respond(403, {code: 'ONBOARDING_REQUIRED'})

        const res = await authFetch('/note/chats')

        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({code: 'ONBOARDING_REQUIRED'})
        expect(listener).toHaveBeenCalledOnce()
        unsubscribe()
    })

    it('ignores other refusals', async () => {
        const listener = vi.fn()
        const unsubscribe = onOnboardingRequired(listener)
        respond(403, {code: 'SECURITY_ERROR'})

        await authFetch('/note/chats')

        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })
})
