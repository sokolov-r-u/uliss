import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    formatting: 'Formatting',
    bold: 'Bold',
    italic: 'Italic',
    heading: 'Heading',
    bulletList: 'Bulleted list',
    orderedList: 'Numbered list',
    undo: 'Undo',
    redo: 'Redo',
    original: 'Original',
}

export const editorToolbarMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        formatting: 'Форматирование',
        bold: 'Жирный',
        italic: 'Курсив',
        heading: 'Заголовок',
        bulletList: 'Маркированный список',
        orderedList: 'Нумерованный список',
        undo: 'Отменить',
        redo: 'Повторить',
        original: 'Оригинал',
    },
}
