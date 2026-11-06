import {describe, expect, it} from 'vitest'
import fc from 'fast-check'
import {parseLocale, resolveLocale} from './locale'

describe('parseLocale', () => {
    it.each([
        ['ru', 'ru'], ['ru-RU', 'ru'], ['ru_UA', 'ru'], ['RU', 'ru'],
        ['en', 'en'], ['en-GB', 'en'], [' en-us ', 'en'],
    ])('reads %s as %s', (tag, expected) => {
        expect(parseLocale(tag)).toBe(expected)
    })

    it.each(['de', 'he-IL', 'rus', 'english', '', 'r', undefined, null, 42])('rejects %s', (tag) => {
        expect(parseLocale(tag)).toBeNull()
    })
})

describe('resolveLocale', () => {
    it.each<[string[], string]>([
        [['ru-RU', 'en'], 'ru'],
        [['de', 'ru'], 'ru'],
        [['de', 'en', 'ru'], 'en'],
        [['de'], 'en'],
        [['he'], 'en'],
        [[], 'en'],
    ])('picks the first supported language of %j', (languages, expected) => {
        expect(resolveLocale(languages)).toBe(expected)
    })

    it('falls back to English without a language list', () => {
        expect(resolveLocale(undefined)).toBe('en')
    })

    it('always returns the first supported entry, English when there is none', () => {
        const tag = fc.oneof(
            fc.constantFrom('ru', 'ru-RU', 'en', 'en-GB', 'de', 'he', 'fr-CA', 'zh-Hant'),
            fc.string(),
        )
        fc.assert(fc.property(fc.array(tag), (languages) => {
            const first = languages.map(parseLocale).find((locale) => locale !== null)
            expect(resolveLocale(languages)).toBe(first ?? 'en')
        }))
    })
})
