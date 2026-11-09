import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    hint: 'Paste an https link to an image',
    loading: 'Loading preview…',
    broken: 'No preview',
    unavailable: 'Image unavailable',
}

export const posterFrameMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        hint: 'Вставьте https-ссылку на картинку',
        loading: 'Загружаем превью…',
        broken: 'Нет превью',
        unavailable: 'Картинка недоступна',
    },
}
