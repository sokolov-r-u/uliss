import type {Dictionaries} from '@uliss/design-system'

const en = {
    kicker: 'Settings',
    sections: 'Settings sections',
    appearance: 'Appearance',
    sky: 'Sky',
    skyHint: 'Names · stars · connections',
    aboutYou: 'About you',
    aboutYouHint: 'From your notes · read-only',
    account: 'Account',
    accountHint: 'Sign out available',
    language: 'Language',
    version: 'Uliss · web preview',
}

export const settingsPageMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        kicker: 'Настройки',
        sections: 'Разделы настроек',
        appearance: 'Оформление',
        sky: 'Небо',
        skyHint: 'Названия · звёзды · связи',
        aboutYou: 'О вас',
        aboutYouHint: 'Из ваших заметок · только чтение',
        account: 'Аккаунт',
        accountHint: 'Можно выйти',
        language: 'Язык',
        version: 'Uliss · веб-версия',
    },
}
