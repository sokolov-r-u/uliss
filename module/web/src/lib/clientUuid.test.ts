import {afterEach, describe, expect, it, vi} from 'vitest'
import {generateClientUuid} from './clientUuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const originalCrypto = globalThis.crypto

describe('generateClientUuid', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        Object.defineProperty(globalThis, 'crypto', {configurable: true, value: originalCrypto})
    })

    it('uses randomUUID when the browser exposes it', () => {
        const expected = '01999999-9999-7999-8999-999999999999'
        const randomUUID = vi.fn(() => expected)
        Object.defineProperty(globalThis, 'crypto', {configurable: true, value: {randomUUID}})

        expect(generateClientUuid()).toBe(expected)
        expect(randomUUID).toHaveBeenCalledOnce()
    })

    it('generates a UUID v4 when an HTTP context exposes no Web Crypto', () => {
        Object.defineProperty(globalThis, 'crypto', {configurable: true, value: undefined})
        vi.spyOn(Math, 'random').mockReturnValue(0.5)

        expect(generateClientUuid()).toMatch(UUID_V4)
    })
})
