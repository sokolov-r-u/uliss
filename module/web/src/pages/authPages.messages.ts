import type {Dictionaries} from '@uliss/design-system'

/** The sign-in redirect, the OAuth callback and the signed-out screen. */
const en = {
    cancelled: 'Sign-in was cancelled or refused.',
    incomplete: 'The sign-in link is incomplete. Start sign-in again.',
    expired: 'The sign-in session has expired. Start sign-in again.',
    failed: 'Could not complete sign-in. Check the connection and try again.',
    authFailed: 'authentication failed',
    completing: 'completing sign-in',
    tryAgain: 'try again',
    oneMoment: 'One moment…',
    signedOut: 'signed out',
    signedOutBody: 'You are signed out of Uliss on this device.',
    signIn: 'sign in',
    redirecting: 'redirecting',
    takingYou: 'Taking you to sign in…',
}

export type CallbackFailure = 'cancelled' | 'incomplete' | 'expired' | 'failed'

export const authPagesMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        cancelled: 'Вход отменён или отклонён.',
        incomplete: 'Ссылка для входа неполная. Начните вход заново.',
        expired: 'Сеанс входа истёк. Начните вход заново.',
        failed: 'Не удалось завершить вход. Проверьте подключение и попробуйте ещё раз.',
        authFailed: 'вход не удался',
        completing: 'завершаю вход',
        tryAgain: 'попробовать ещё раз',
        oneMoment: 'Минутку…',
        signedOut: 'вы вышли',
        signedOutBody: 'Вы вышли из Uliss на этом устройстве.',
        signIn: 'войти',
        redirecting: 'переход',
        takingYou: 'Переходим ко входу…',
    },
}
