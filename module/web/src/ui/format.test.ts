import {describe, expect, it} from 'vitest'
import {formatFullDate, formatMonth, formatShortDate, noteCountLabel} from './format'

const iso = '2026-06-22T09:00:00Z'
const local = (options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString(undefined, options)

describe('format', () => {
    it('formats absolute dates in three lengths and tolerates missing or invalid input', () => {
        expect(formatShortDate(iso)).toBe(local({month: 'short', day: 'numeric'}))
        expect(formatFullDate(iso)).toBe(local({month: 'short', day: 'numeric', year: 'numeric'}))
        expect(formatMonth(iso)).toBe(local({month: 'long', year: 'numeric'}))
        for (const bad of [undefined, '', 'not a date']) {
            expect(formatShortDate(bad)).toBe('')
            expect(formatFullDate(bad)).toBe('')
            expect(formatMonth(bad)).toBe('')
        }
    })

    it('words a note count', () => {
        expect(noteCountLabel(0)).toBe('No notes yet')
        expect(noteCountLabel(1)).toBe('1 note')
        expect(noteCountLabel(3)).toBe('3 notes')
    })
})
