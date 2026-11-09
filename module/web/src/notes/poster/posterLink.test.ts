import {describe, expect, it} from 'vitest'
import {checkPosterLink, POSTER_LINK_MAX, posterHost} from './posterLink'

describe('checkPosterLink', () => {
    it('accepts an https link whole, however long under the limit, trimmed', () => {
        const link = 'https://www.acmodasi.in/amdb/images/movie/d/i/tokyo-story-1953-109623.jpg'
        expect(checkPosterLink(`  ${link}\n`)).toEqual({kind: 'ok', href: link})
    })

    it('saves the browser form of a link: a Cyrillic path encoded, an IDN host in punycode', () => {
        expect(checkPosterLink('https://пример.рф/постер.jpg')).toEqual({
            kind: 'ok', href: 'https://xn--e1afmkfd.xn--p1ai/%D0%BF%D0%BE%D1%81%D1%82%D0%B5%D1%80.jpg',
        })
    })

    it.each(['http://example.com/p.jpg', 'ftp://example.com/p.jpg', 'javascript:alert(1)', 'example.com/p.jpg',
        'not a link'])('refuses %s as not https', (link) => {
        expect(checkPosterLink(link)).toEqual({kind: 'not-https'})
    })

    it('refuses a link with a user name or password', () => {
        expect(checkPosterLink('https://user:secret@example.com/p.jpg')).toEqual({kind: 'credentials'})
        expect(checkPosterLink('https://user@example.com/p.jpg')).toEqual({kind: 'credentials'})
    })

    it('measures the limit on the saved form, so encoding can push a link over it', () => {
        const base = 'https://example.com/'
        expect(checkPosterLink(base + 'a'.repeat(POSTER_LINK_MAX - base.length)).kind).toBe('ok')
        expect(checkPosterLink(base + 'a'.repeat(POSTER_LINK_MAX - base.length + 1))).toEqual({kind: 'too-long'})
        // 700 Cyrillic letters are 4200 characters once percent-encoded
        expect(checkPosterLink(base + 'я'.repeat(700))).toEqual({kind: 'too-long'})
    })

    it('reads nothing into a blank field', () => {
        expect(checkPosterLink('   ')).toEqual({kind: 'empty'})
    })
})

describe('posterHost', () => {
    it('names the host of a link and nothing for a broken one', () => {
        expect(posterHost('https://images.example.com:8443/p.jpg')).toBe('images.example.com:8443')
        expect(posterHost('nonsense')).toBe('')
    })
})
