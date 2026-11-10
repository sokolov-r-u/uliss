import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    frame: 'Frame',
    panel: 'Panel 2:3',
    avatar: 'Sky avatar',
    stagePanel: 'Panel frame 2:3. Drag to move, scroll or pinch to zoom, arrow keys move, plus and minus zoom.',
    stageAvatar: 'Sky avatar. Drag to move, scroll or pinch to zoom, arrow keys move, plus and minus zoom.',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Reset',
    help: 'Drag to move · scroll or pinch to zoom · arrows move',
    helpTouch: 'Drag to move · pinch to zoom',
    loading: 'Loading the image…',
    unavailable: 'Image unavailable',
    posterPreview: 'Poster preview',
    avatarPreview: 'Avatar preview',
}

export const posterCropperMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        frame: 'Кадр',
        panel: 'Панель 2:3',
        avatar: 'Аватар на небе',
        stagePanel: 'Кадр панели 2:3. Перетащите, чтобы сдвинуть, колесо или щипок — масштаб, стрелки двигают, плюс и минус — масштаб.',
        stageAvatar: 'Аватар на небе. Перетащите, чтобы сдвинуть, колесо или щипок — масштаб, стрелки двигают, плюс и минус — масштаб.',
        zoomIn: 'Увеличить',
        zoomOut: 'Уменьшить',
        reset: 'Сбросить',
        help: 'Перетащите, чтобы сдвинуть · колесо или щипок — масштаб · стрелки двигают',
        helpTouch: 'Перетащите, чтобы сдвинуть · щипок — масштаб',
        loading: 'Загружаем картинку…',
        unavailable: 'Картинка недоступна',
        posterPreview: 'Превью постера',
        avatarPreview: 'Превью аватара',
    },
}
