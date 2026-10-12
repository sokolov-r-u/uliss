import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {authFetch} from './apiClient'
import {login, refreshTokens} from './authApi'
import {getTokens, setTokens, type Tokens} from './tokenStore'

vi.mock('./authApi', () => ({login: vi.fn(), refreshTokens: vi.fn()}))

const fresh: Tokens = {accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: Date.now() + 15 * 60_000}

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
        setTokens({accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - 1000})
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
})
