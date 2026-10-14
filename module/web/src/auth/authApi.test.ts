import {afterEach, describe, expect, it, vi} from 'vitest'
import {RefreshRejectedError, refreshTokens} from './authApi'

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
