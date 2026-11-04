import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    actionsFor: (title: string) => `Actions for ${title}`,
    menuHint: 'Rename · Delete',
}

export const listRowMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        actionsFor: (title) => `Действия: ${title}`,
        menuHint: 'Переименовать · Удалить',
    },
}
