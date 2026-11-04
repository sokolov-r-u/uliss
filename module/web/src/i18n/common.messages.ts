import {type Dictionaries, plural} from '@uliss/design-system'

/** Words several screens share: actions, list states, section names. */
const en = {
    retry: 'Retry',
    loading: 'Loading…',
    pinned: 'Pinned',
    chats: 'Chats',
    notes: 'Notes',
    constellations: 'Constellations',
    sky: 'Sky',
    updates: 'Updates',
    settings: 'Settings',
    search: 'Search',
    back: 'Back',
    openNavigation: 'Open navigation',
    untitledNote: 'Untitled note',
    actionsFor: (title: string) => `Actions for ${title}`,
    couldNotLoadMore: 'Could not load more.',
    noteCount: (count: number) => count <= 0 ? 'No notes yet' : count === 1 ? '1 note' : `${count} notes`,
}

export const commonMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        retry: 'Повторить',
        loading: 'Загрузка…',
        pinned: 'Закреплённые',
        chats: 'Чаты',
        notes: 'Заметки',
        constellations: 'Созвездия',
        sky: 'Небо',
        updates: 'Обновления',
        settings: 'Настройки',
        search: 'Поиск',
        back: 'Назад',
        openNavigation: 'Открыть навигацию',
        untitledNote: 'Без названия',
        actionsFor: (title) => `Действия: ${title}`,
        couldNotLoadMore: 'Не удалось загрузить ещё.',
        noteCount: (count) => count <= 0 ? 'Заметок пока нет'
            : `${count} ${plural('ru', count, {one: 'заметка', few: 'заметки', many: 'заметок', other: 'заметки'})}`,
    },
}
