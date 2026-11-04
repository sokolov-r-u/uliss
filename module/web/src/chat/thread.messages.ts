import type {Dictionaries} from '@uliss/design-system'

/** The message thread, its bubbles and the summary name field. */
const en = {
    loadingEarlier: 'Loading earlier messages…',
    beginning: 'Beginning of conversation',
    nothingSaid: 'Nothing said yet',
    nothingSaidBody: 'Write a thought below. Uliss keeps the thread and pulls out a note when one is worth keeping.',
    searchingNotes: 'searching notes…',
    thinking: 'thinking…',
    interrupted: 'interrupted',
    failedToReply: 'failed to reply',
    stopped: 'stopped',
    dictateName: 'Dictate the name',
    stopRecording: 'Stop recording',
    transcribing: 'Transcribing…',
    retryTranscription: 'Retry the transcription',
    recordingClock: (elapsed: string, max: string) => `Recording ${elapsed} / ${max}`,
    shortenName: (limit: number) => `Shorten the name to ${limit} characters.`,
    name: 'Name',
    namePlaceholder: 'Uliss names it if you leave this empty',
}

export const threadMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        loadingEarlier: 'Загружаю ранние сообщения…',
        beginning: 'Начало разговора',
        nothingSaid: 'Пока ничего не сказано',
        nothingSaidBody: 'Запишите мысль ниже. Uliss сохранит разговор и вынесет заметку, когда будет что сохранить.',
        searchingNotes: 'ищу в заметках…',
        thinking: 'думаю…',
        interrupted: 'прервано',
        failedToReply: 'не удалось ответить',
        stopped: 'остановлено',
        dictateName: 'Продиктовать название',
        stopRecording: 'Остановить запись',
        transcribing: 'Расшифровка…',
        retryTranscription: 'Повторить расшифровку',
        recordingClock: (elapsed, max) => `Запись ${elapsed} / ${max}`,
        shortenName: (limit) => `Сократите название до ${limit} символов.`,
        name: 'Название',
        namePlaceholder: 'Если оставить пустым, Uliss назовёт сам',
    },
}
