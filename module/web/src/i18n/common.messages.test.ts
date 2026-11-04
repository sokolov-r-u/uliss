import {describe, expect, it} from 'vitest'
import {commonMessages} from './common.messages'

describe('commonMessages.noteCount', () => {
    it('words a note count in English', () => {
        const {noteCount} = commonMessages.en
        expect([0, 1, 3].map(noteCount)).toEqual(['No notes yet', '1 note', '3 notes'])
    })

    it('agrees the Russian noun with the number', () => {
        const {noteCount} = commonMessages.ru
        expect([0, 1, 2, 5, 11, 21, 24].map(noteCount))
            .toEqual(['Заметок пока нет', '1 заметка', '2 заметки', '5 заметок', '11 заметок', '21 заметка', '24 заметки'])
    })
})
