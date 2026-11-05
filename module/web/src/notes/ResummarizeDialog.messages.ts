import type {Dictionaries} from '@uliss/design-system'

const en = {
    title: 'Summarize this note again?',
    body: 'Uliss rewrites the text from the whole chat. Your edits and additions are replaced; the title, icon and '
        + 'place stay.',
    inProgress: 'Uliss is already writing a note from this chat. Try again when it is done.',
    chatGone: 'The chat of this note is gone, so it cannot be summarized again.',
    notReady: 'This note is not ready yet. Try again when it is done.',
    gone: 'This note can no longer be summarized again.',
    summarizing: 'Summarizing…',
    summarize: 'Summarize',
    cancel: 'Cancel',
}

export const resummarizeMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        title: 'Подвести итог заново?',
        body: 'Uliss перепишет текст по всему чату. Ваши правки и дополнения пропадут; название, иконка и место '
            + 'останутся.',
        inProgress: 'Uliss уже пишет заметку по этому чату. Попробуйте, когда он закончит.',
        chatGone: 'Чата этой заметки больше нет, поэтому подвести итог заново нельзя.',
        notReady: 'Заметка ещё не готова. Попробуйте, когда она будет готова.',
        gone: 'Подвести итог заново больше нельзя.',
        summarizing: 'Подвожу итог…',
        summarize: 'Подвести итог',
        cancel: 'Отмена',
    },
}
