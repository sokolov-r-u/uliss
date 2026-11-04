import {describe, expect, it} from 'vitest'
import {formatFullDate, formatMonth, formatShortDate} from './format'

const iso = '2026-06-22T09:00:00Z'
describe('format', () => {
    it('formats absolute dates in three lengths in the interface language, not the OS locale', () => {
        expect(formatShortDate(iso, 'en')).toBe('Jun 22')
        expect(formatFullDate(iso, 'en')).toBe('Jun 22, 2026')
        expect(formatMonth(iso, 'en')).toBe('June 2026')
        expect(formatShortDate(iso, 'ru')).toBe('22 июн.')
        expect(formatFullDate(iso, 'ru')).toBe('22 июн. 2026 г.')
        expect(formatMonth(iso, 'ru')).toBe('июнь 2026 г.')
    })

    it('tolerates missing or invalid input', () => {
        for (const bad of [undefined, '', 'not a date']) {
            expect(formatShortDate(bad, 'en')).toBe('')
            expect(formatFullDate(bad, 'ru')).toBe('')
            expect(formatMonth(bad, 'en')).toBe('')
        }
    })
})
