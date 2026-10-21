import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {describeError, errorCode, segment, userMessage} from './apiHelpers'

describe('segment', () => {
    it('keeps any id inside one path segment', () => {
        expect(segment('../admin')).toBe('..%2Fadmin')
        fc.assert(fc.property(fc.string(), (id) => {
            const encoded = segment(id)
            expect(encoded).not.toMatch(/[/?#]/)
            expect(decodeURIComponent(encoded)).toBe(id)
        }))
    })
})

describe('errorCode', () => {
    it('reads the service code and ignores bodies without one', async () => {
        expect(await errorCode(new Response('{"code":"VERSION_CONFLICT"}', {status: 409}))).toBe('VERSION_CONFLICT')
        expect(await errorCode(new Response('<html>bad gateway</html>', {status: 502}))).toBeUndefined()
        expect(await errorCode(new Response('{"code":42}', {status: 400}))).toBeUndefined()
    })
})

describe('describeError', () => {
    it('words an API error by its kind and status, never with the technical message', () => {
        const apiError = (kind: string, status?: number) => Object.assign(new Error('GET /note/x failed: 404 {...}'), {kind, status})

        expect(describeError(apiError('http', 404))).toBe(userMessage(404))
        expect(describeError(apiError('http', 503))).toBe('Something went wrong on our side. Try again in a moment.')
        expect(describeError(apiError('transport'))).toBe(userMessage(undefined, 'transport'))
        expect(describeError(apiError('protocol'))).toBe(userMessage(undefined, 'protocol'))
        expect(describeError(new Error('boom'))).toBe('The request could not be completed. Try again.')
        expect(describeError('boom')).not.toContain('boom')
    })
})
