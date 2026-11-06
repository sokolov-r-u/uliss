import type {Dictionaries} from '@uliss/design-system'

const en = {
    kicker: 'Account',
    profile: 'Profile',
    profileBody: 'Account details cannot be viewed or edited here yet.',
    session: 'Session',
    signOut: 'Sign out',
}

export const accountMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        kicker: 'Аккаунт',
        profile: 'Профиль',
        profileBody: 'Данные аккаунта здесь пока нельзя посмотреть или изменить.',
        session: 'Сеанс',
        signOut: 'Выйти',
    },
}
