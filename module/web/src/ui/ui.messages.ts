import type {Dictionaries} from '@uliss/design-system'

/** The app frame's own words: panels, screen loading, list footers. */
const en = {
    screenFailed: 'This screen could not load',
    screenFailedBody: 'Uliss may have been updated. Reload to get the latest version.',
    reload: 'Reload',
    closePanel: 'Close panel',
    resizePanel: 'Resize panel',
    pinnedFailed: 'Pinned items did not load.',
    couldNotLoadNotes: 'Could not load the notes.',
    couldNotLoadChats: 'Could not load the chats.',
}

export const uiMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        screenFailed: 'Экран не загрузился',
        screenFailedBody: 'Возможно, Uliss обновился. Перезагрузите страницу, чтобы получить новую версию.',
        reload: 'Перезагрузить',
        closePanel: 'Закрыть панель',
        resizePanel: 'Изменить ширину панели',
        pinnedFailed: 'Не удалось загрузить закреплённые.',
        couldNotLoadNotes: 'Не удалось загрузить заметки.',
        couldNotLoadChats: 'Не удалось загрузить чаты.',
    },
}
