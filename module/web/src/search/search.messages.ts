import type {Dictionaries} from '@uliss/design-system'

const en = {
    placeholder: 'Search your notes and chats',
    clear: 'Clear',
    noMatch: (query: string) => `No notes match “${query}”`,
    noMatchBody: 'Uliss searches note titles and text. Try a shorter word, or look through your chats instead.',
    emptyBody: 'Type a word or two. Uliss looks through note titles, note text, and your conversations.',
    searchChats: 'Search chats',
    notes: 'Notes',
    shown: (shown: number, all: number) => `${shown} of ${all}`,
    alsoInChats: 'Also in chats',
}

export const searchMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        placeholder: 'Поиск по заметкам и чатам',
        clear: 'Очистить',
        noMatch: (query) => `Нет заметок по запросу «${query}»`,
        noMatchBody: 'Uliss ищет по названиям и тексту заметок. Попробуйте слово покороче или поищите в чатах.',
        emptyBody: 'Введите слово-другое. Uliss ищет по названиям и тексту заметок и по вашим разговорам.',
        searchChats: 'Искать в чатах',
        notes: 'Заметки',
        shown: (shown, all) => `${shown} из ${all}`,
        alsoInChats: 'Ещё в чатах',
    },
}
