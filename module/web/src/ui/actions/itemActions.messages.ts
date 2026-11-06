import {type Dictionaries, plural} from '@uliss/design-system'

type Kind = 'chat' | 'note'

/** The item menu (Pin · Rename · Delete) and its dialogs, for a chat or a note. */
const en = {
    keepSubNotes: 'Keep sub-notes',
    keepSubNotesNote: 'They take its place',
    deleteAll: 'Delete all',
    deleteAllNote: 'The note with all its sub-notes',
    deleteNoteBody: (title: string, count: number) =>
        `“${title}” has ${count === 1 ? 'a sub-note' : `${count} sub-notes`}. Kept sub-notes move up to its place; `
        + 'chats are never deleted.',
    deleteChatBody: (noteCount: number) => noteCount <= 0
        ? 'No notes were written from it. The conversation does not come back.'
        : noteCount === 1
            ? 'Uliss wrote a note from this chat. It will stay — delete it from Notes if you no longer need it.'
            : `Uliss wrote ${noteCount} notes from this chat. They will stay — delete them from Notes if you no longer `
            + 'need them.',
    pinLimit: (limit: number, kind: Kind) => `${limit} ${kind}s are pinned already. Unpin one first.`,
    gone: (kind: Kind) => kind === 'chat' ? 'This chat no longer exists.' : 'This note no longer exists.',
    busy: (kind: Kind) => kind === 'chat' ? 'Stop the reply before deleting this chat.' : 'This note is still being written.',
    titleRule: 'Use a title of 1 to 50 characters.',
    unpin: 'Unpin',
    pinFull: (limit: number) => `Pin · ${limit} max`,
    pin: 'Pin',
    rename: 'Rename',
    delete: 'Delete',
    couldNotPin: (unpin: boolean, kind: Kind) => `Could not ${unpin ? 'unpin' : 'pin'} this ${kind}`,
    close: 'Close',
    renameTitle: (kind: Kind) => kind === 'chat' ? 'Rename chat' : 'Rename note',
    saving: 'Saving…',
    save: 'Save',
    cancel: 'Cancel',
    title: 'Title',
    deleteTitle: (title: string) => `Delete “${title}”?`,
    deleting: 'Deleting…',
    subNotes: 'Sub-notes',
}

export const itemActionsMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        keepSubNotes: 'Оставить подзаметки',
        keepSubNotesNote: 'Они займут её место',
        deleteAll: 'Удалить всё',
        deleteAllNote: 'Заметку вместе со всеми подзаметками',
        deleteNoteBody: (title, count) =>
            `У «${title}» ${count} ${plural('ru', count, {one: 'подзаметка', few: 'подзаметки', many: 'подзаметок', other: 'подзаметки'})}. `
            + 'Оставленные подзаметки поднимутся на её место; чаты не удаляются.',
        deleteChatBody: (noteCount) => noteCount <= 0
            ? 'Заметок по нему нет. Восстановить разговор будет нельзя.'
            : noteCount === 1
                ? 'Uliss написал по этому чату заметку. Она останется — удалите её в «Заметках», если она не нужна.'
                : `Uliss написал по этому чату ${noteCount} ${plural('ru', noteCount, {one: 'заметку', few: 'заметки', many: 'заметок', other: 'заметки'})}. `
                + 'Они останутся — удалите их в «Заметках», если они не нужны.',
        pinLimit: (limit, kind) => `Уже закреплено ${limit} ${kind === 'chat'
            ? plural('ru', limit, {one: 'чат', few: 'чата', many: 'чатов', other: 'чата'})
            : plural('ru', limit, {one: 'заметка', few: 'заметки', many: 'заметок', other: 'заметки'})}. `
            + `Сначала открепите ${kind === 'chat' ? 'один' : 'одну'}.`,
        gone: (kind) => kind === 'chat' ? 'Этого чата больше нет.' : 'Этой заметки больше нет.',
        busy: (kind) => kind === 'chat' ? 'Остановите ответ, прежде чем удалять чат.' : 'Эта заметка ещё пишется.',
        titleRule: 'Название — от 1 до 50 символов.',
        unpin: 'Открепить',
        pinFull: (limit) => `Закрепить · не больше ${limit}`,
        pin: 'Закрепить',
        rename: 'Переименовать',
        delete: 'Удалить',
        couldNotPin: (unpin, kind) => `Не удалось ${unpin ? 'открепить' : 'закрепить'} ${kind === 'chat' ? 'чат' : 'заметку'}`,
        close: 'Закрыть',
        renameTitle: (kind) => kind === 'chat' ? 'Переименовать чат' : 'Переименовать заметку',
        saving: 'Сохранение…',
        save: 'Сохранить',
        cancel: 'Отмена',
        title: 'Название',
        deleteTitle: (title) => `Удалить «${title}»?`,
        deleting: 'Удаление…',
        subNotes: 'Подзаметки',
    },
}
