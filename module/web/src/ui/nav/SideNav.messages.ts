import type {Dictionaries} from '@uliss/design-system'

const en = {
    resize: 'Resize sidebar',
    closeNavigation: 'Close navigation',
    primaryNavigation: 'Primary navigation',
    expand: 'Expand sidebar',
    collapse: 'Collapse sidebar',
    newChat: 'New',
    couldNotLoad: 'Could not load',
    couldNotLoadBody: 'Your chats and notes did not load. Check the connection.',
    empty: 'Nothing here yet',
    emptyBody: 'Chats and notes will collect here as you talk.',
    tabs: 'Side panel list',
    recentChats: 'Recent chats',
    recentNotes: 'Recent notes',
    viewAll: 'View all →',
}

export const sideNavMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        resize: 'Изменить ширину панели',
        closeNavigation: 'Закрыть навигацию',
        primaryNavigation: 'Основная навигация',
        expand: 'Развернуть панель',
        collapse: 'Свернуть панель',
        newChat: 'Новый',
        couldNotLoad: 'Не загрузилось',
        couldNotLoadBody: 'Чаты и заметки не загрузились. Проверьте подключение.',
        empty: 'Здесь пока пусто',
        emptyBody: 'Чаты и заметки будут собираться здесь по мере разговора.',
        tabs: 'Список боковой панели',
        recentChats: 'Недавние чаты',
        recentNotes: 'Недавние заметки',
        viewAll: 'Все →',
    },
}
