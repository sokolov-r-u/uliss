import type {Dictionaries} from '@uliss/design-system'

/** How a failed service call reads to the user, by its kind and HTTP status. */
const en = {
    transport: 'The service is unreachable. Check the connection and try again.',
    protocol: 'The service answered unexpectedly. Try again in a moment.',
    notFound: 'This is no longer here — it may have been deleted.',
    conflict: 'It changed in the meantime. Reload and try again.',
    tooMany: 'Too many requests at once. Wait a moment and try again.',
    server: 'Something went wrong on our side. Try again in a moment.',
    other: 'The request could not be completed. Try again.',
}

export const apiErrorMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        transport: 'Сервис недоступен. Проверьте подключение и попробуйте ещё раз.',
        protocol: 'Сервис вернул неожиданный ответ. Попробуйте ещё раз чуть позже.',
        notFound: 'Этого уже нет — возможно, его удалили.',
        conflict: 'Данные успели измениться. Перезагрузите страницу и попробуйте ещё раз.',
        tooMany: 'Слишком много запросов сразу. Подождите немного и попробуйте ещё раз.',
        server: 'Что-то пошло не так на нашей стороне. Попробуйте ещё раз чуть позже.',
        other: 'Запрос не выполнен. Попробуйте ещё раз.',
    },
}
