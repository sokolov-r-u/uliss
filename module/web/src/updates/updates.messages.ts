import type {Dictionaries} from '@uliss/design-system'

const en = {
    empty: 'Nothing to report yet',
    emptyBody: 'This is where Uliss records what it does on its own — links it draws, notes it writes, patterns it '
        + 'spots. It fills in as you talk.',
    decisions: 'Decisions',
    toDecide: 'To decide',
    position: (index: number, total: number) => `${index} of ${total}`,
    notNow: 'Not now',
    stop: 'Stop for now',
    filter: 'Update filter',
    all: 'All',
    link: 'Links',
    note: 'Writing',
    pattern: 'Noticed',
    undo: 'Undo',
    none: 'No updates in this filter.',
}

export const updatesMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        empty: 'Пока не о чем сообщить',
        emptyBody: 'Здесь Uliss отмечает то, что делает сам: связи, которые проводит, заметки, которые пишет, '
            + 'закономерности, которые замечает. Заполняется по мере разговора.',
        decisions: 'Решения',
        toDecide: 'Решить',
        position: (index, total) => `${index} из ${total}`,
        notNow: 'Не сейчас',
        stop: 'Пока хватит',
        filter: 'Фильтр обновлений',
        all: 'Все',
        link: 'Связи',
        note: 'Записи',
        pattern: 'Замечено',
        undo: 'Отменить',
        none: 'В этом фильтре обновлений нет.',
    },
}
