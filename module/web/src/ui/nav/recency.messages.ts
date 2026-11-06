import type {Dictionaries} from '@uliss/design-system'

/** The side panel's recency group headings: section labels of the kit, not row dates. */
const en = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    thisMonth: 'This month',
    earlier: 'Earlier',
}

export const recencyMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        today: 'Сегодня',
        yesterday: 'Вчера',
        thisWeek: 'На этой неделе',
        thisMonth: 'В этом месяце',
        earlier: 'Раньше',
    },
}
