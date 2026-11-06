import {describe, expect, it} from 'vitest'
import {plural} from './plural'

const NOTE_RU = {one: 'заметка', few: 'заметки', many: 'заметок', other: 'заметки'}
const NOTE_EN = {one: 'note', other: 'notes'}

describe('plural', () => {
    it.each([
        [0, 'заметок'], [1, 'заметка'], [2, 'заметки'], [4, 'заметки'], [5, 'заметок'],
        [11, 'заметок'], [12, 'заметок'], [14, 'заметок'], [21, 'заметка'], [22, 'заметки'],
        [25, 'заметок'], [101, 'заметка'], [111, 'заметок'], [1.5, 'заметки'],
    ])('agrees %d with the Russian form %s', (count, expected) => {
        expect(plural('ru', count, NOTE_RU)).toBe(expected)
    })

    it.each([[0, 'notes'], [1, 'note'], [2, 'notes'], [21, 'notes']])('agrees %d in English', (count, expected) => {
        expect(plural('en', count, NOTE_EN)).toBe(expected)
    })

    it('falls back to other when a Russian form is missing', () => {
        expect(plural('ru', 5, {one: 'x', other: 'y'})).toBe('y')
        expect(plural('ru', 3, {one: 'x', other: 'y'})).toBe('y')
    })
})
