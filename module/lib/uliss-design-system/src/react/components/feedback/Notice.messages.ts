import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    continue: 'Continue',
    working: 'Working…',
    close: 'Close',
    back: 'Back',
}

export const noticeMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        continue: 'Продолжить',
        working: 'Выполняется…',
        close: 'Закрыть',
        back: 'Назад',
    },
}
