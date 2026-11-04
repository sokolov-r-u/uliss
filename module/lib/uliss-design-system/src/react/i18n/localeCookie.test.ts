import {afterEach, describe, expect, it} from 'vitest'
import fc from 'fast-check'
import {localeCookie, readLocaleCookie, writeLocaleCookie} from './localeCookie'

describe('readLocaleCookie', () => {
    it('finds the choice among other cookies', () => {
        expect(readLocaleCookie('theme=x; uliss_lang=ru; other=1')).toBe('ru')
        expect(readLocaleCookie('uliss_lang=en')).toBe('en')
    })

    it('ignores an unknown value, an empty one and similarly named cookies', () => {
        expect(readLocaleCookie('uliss_lang=de')).toBeNull()
        expect(readLocaleCookie('uliss_lang=')).toBeNull()
        expect(readLocaleCookie('x_uliss_lang=ru; uliss_lang_old=ru')).toBeNull()
        expect(readLocaleCookie('')).toBeNull()
    })

    it('takes the first valid one when a host-only duplicate holds junk', () => {
        expect(readLocaleCookie('uliss_lang=zz; uliss_lang=ru')).toBe('ru')
    })

    it('reads back what it writes for any host', () => {
        const host = fc.record({
            hostname: fc.constantFrom('uliss.home', 'app.example.com', 'localhost', '127.0.0.1'),
            protocol: fc.constantFrom('https:', 'http:'),
        })
        fc.assert(fc.property(fc.constantFrom('en' as const, 'ru' as const), host, (locale, where) => {
            const pair = localeCookie(locale, where).split(';')[0]
            expect(readLocaleCookie(`a=b; ${pair}`)).toBe(locale)
        }))
    })
})

describe('localeCookie', () => {
    it('shares the choice with subdomains for a year on a named host over https', () => {
        expect(localeCookie('ru', {hostname: 'uliss.home', protocol: 'https:'}))
            .toBe('uliss_lang=ru; Path=/; SameSite=Lax; Domain=uliss.home; Secure; Max-Age=31536000')
    })

    it('keeps a host-only cookie on localhost and IP addresses, without Secure over http', () => {
        expect(localeCookie('en', {hostname: 'localhost', protocol: 'http:'}))
            .toBe('uliss_lang=en; Path=/; SameSite=Lax; Max-Age=31536000')
        expect(localeCookie('en', {hostname: '192.168.1.5', protocol: 'http:'})).not.toContain('Domain')
        expect(localeCookie('en', {hostname: '::1', protocol: 'http:'})).not.toContain('Domain')
    })

    it('expires the cookie to clear the choice', () => {
        expect(localeCookie(null, {hostname: 'uliss.home', protocol: 'https:'}))
            .toBe('uliss_lang=; Path=/; SameSite=Lax; Domain=uliss.home; Secure; Max-Age=0')
    })
})

describe('writeLocaleCookie', () => {
    afterEach(() => writeLocaleCookie(null))

    it('stores and clears the choice in this document', () => {
        writeLocaleCookie('ru')
        expect(readLocaleCookie(document.cookie)).toBe('ru')
        writeLocaleCookie(null)
        expect(readLocaleCookie(document.cookie)).toBeNull()
    })
})
