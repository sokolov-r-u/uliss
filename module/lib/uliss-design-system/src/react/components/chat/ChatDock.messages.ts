import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    placeholder: 'Write a thought…',
    recording: 'Recording',
    message: 'Message',
    stopRecording: 'Stop recording',
    sendRecording: 'Send recording',
    retryTranscription: 'Retry transcription',
    transcribing: 'Transcribing…',
    voiceUnavailable: 'Voice input unavailable',
    voiceInput: 'Voice input',
    stopGeneration: 'Stop generation',
    send: 'Send',
}

export const chatDockMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        placeholder: 'Запишите мысль…',
        recording: 'Запись',
        message: 'Сообщение',
        stopRecording: 'Остановить запись',
        sendRecording: 'Отправить запись',
        retryTranscription: 'Повторить расшифровку',
        transcribing: 'Расшифровка…',
        voiceUnavailable: 'Голосовой ввод недоступен',
        voiceInput: 'Голосовой ввод',
        stopGeneration: 'Остановить ответ',
        send: 'Отправить',
    },
}
