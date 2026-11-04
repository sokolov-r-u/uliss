import type {Dictionaries} from '@uliss/design-system'

const en = {
    kicker: 'Account',
    profile: 'Profile',
    profileBody: 'Profile details are not available to this client. Account editing is unavailable.',
    session: 'Session',
    signOut: 'Sign out',
}

export const accountMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        kicker: 'Аккаунт',
        profile: 'Профиль',
        profileBody: 'Данные профиля недоступны в этом клиенте. Редактировать аккаунт пока нельзя.',
        session: 'Сеанс',
        signOut: 'Выйти',
    },
}
