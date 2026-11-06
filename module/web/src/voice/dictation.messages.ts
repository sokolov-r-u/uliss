import type {Dictionaries} from '@uliss/design-system'

/** What dictation tells the user under the field. */
const en = {
    nothingHeard: 'Nothing heard',
    transcriptionFailed: "Couldn't transcribe the recording",
    microphoneBlocked: 'Allow microphone access to dictate',
    microphoneUnavailable: "Couldn't start the microphone",
    recordingRefused: "Uliss couldn't read this recording",
    recordingTooLarge: 'The recording is too large to transcribe',
}

export type DictationNoticeKey = keyof typeof en

export const dictationMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        nothingHeard: 'Ничего не слышно',
        transcriptionFailed: 'Не удалось расшифровать запись',
        microphoneBlocked: 'Разрешите доступ к микрофону, чтобы диктовать',
        microphoneUnavailable: 'Не удалось включить микрофон',
        recordingRefused: 'Uliss не смог распознать эту запись',
        recordingTooLarge: 'Запись слишком большая для расшифровки',
    },
}
