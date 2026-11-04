import type {Dictionaries} from '@uliss/design-system'

/** The note screen. */
const en = {
    noteDetails: 'Note details',
    note: 'Note',
    writing: 'Writing this note…',
    writingBody: 'Generation continues in the background. You can leave and return later.',
    summaryFailed: 'Summary failed',
    summaryFailedBody: 'The source chat is unchanged. Request a new summary from the conversation.',
    notFound: 'Note not found',
    notFoundBody: 'It may not exist, or it may belong to another account.',
    couldNotLoad: 'Could not load the note',
    updating: 'Updating this note…',
    thisNote: 'This note',
    stillWriting: 'The note is still being written. Check back later.',
    edit: 'Edit note',
    summarizeAgain: 'Summarize again',
}

export const noteDetailMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        noteDetails: 'О заметке',
        note: 'Заметка',
        writing: 'Заметка пишется…',
        writingBody: 'Это продолжается в фоне. Можно уйти и вернуться позже.',
        summaryFailed: 'Итог не удался',
        summaryFailedBody: 'Исходный чат не изменился. Подведите итог заново из разговора.',
        notFound: 'Заметка не найдена',
        notFoundBody: 'Возможно, её нет или она принадлежит другому аккаунту.',
        couldNotLoad: 'Не удалось загрузить заметку',
        updating: 'Заметка обновляется…',
        thisNote: 'Эта заметка',
        stillWriting: 'Заметка ещё пишется. Загляните позже.',
        edit: 'Редактировать',
        summarizeAgain: 'Подвести итог заново',
    },
}
