import type {Dictionaries} from '@uliss/design-system'

/** The date-of-birth field and its calendar. Month names come from `Intl`. */
const en = {
    weekdays: 'Mo Tu We Th Fr Sa Su',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    datePlaceholder: 'DD/MM/YYYY',
    dateSeparator: '/',
    closeCalendar: 'Close calendar',
    openCalendar: 'Open calendar',
}

export const fieldsMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        weekdays: 'Пн Вт Ср Чт Пт Сб Вс',
        previousMonth: 'Предыдущий месяц',
        nextMonth: 'Следующий месяц',
        datePlaceholder: 'ДД.ММ.ГГГГ',
        dateSeparator: '.',
        closeCalendar: 'Закрыть календарь',
        openCalendar: 'Открыть календарь',
    },
}
