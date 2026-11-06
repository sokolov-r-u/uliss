import type {Dictionaries} from '@uliss/design-system'

const en = {
    kicker: 'Language',
    section: 'Interface',
    group: 'Interface language',
    auto: 'As in the browser',
    autoNote: (language: string) => `Now ${language}`,
    explicitNote: 'Stays the same whatever the browser language',
    para: 'Applies to this browser, the sign-in page included. Chats and notes keep the language you write them in.',
    rowHint: (language: string, auto: boolean) => auto ? `${language} · as in the browser` : language,
}

export const languageSettingsMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        kicker: 'Язык',
        section: 'Интерфейс',
        group: 'Язык интерфейса',
        auto: 'Как в браузере',
        autoNote: (language) => `Сейчас: ${language}`,
        explicitNote: 'Не зависит от языка браузера',
        para: 'Действует в этом браузере, включая страницу входа. Чаты и заметки остаются на том языке, на котором '
            + 'вы их пишете.',
        rowHint: (language, auto) => auto ? `${language} · как в браузере` : language,
    },
}
