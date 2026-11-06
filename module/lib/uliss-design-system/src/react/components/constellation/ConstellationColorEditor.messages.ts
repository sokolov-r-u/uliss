import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    colour: 'Colour',
    close: 'Close colour',
    palette: 'Palette',
    hue: (tone: number) => `Hue ${tone}`,
    shiftHue: 'Or shift the hue',
    hueSlider: 'Hue',
    lightness: 'Lightness',
    DEEP: 'Deep',
    BASE: 'Base',
    LIGHT: 'Light',
    PALE: 'Pale',
    saving: 'Saving…',
    save: 'Save',
}

export const constellationColorEditorMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        colour: 'Цвет',
        close: 'Закрыть выбор цвета',
        palette: 'Палитра',
        hue: (tone) => `Оттенок ${tone}`,
        shiftHue: 'Или сдвиньте оттенок',
        hueSlider: 'Оттенок',
        lightness: 'Яркость',
        DEEP: 'Глубокий',
        BASE: 'Базовый',
        LIGHT: 'Светлый',
        PALE: 'Бледный',
        saving: 'Сохранение…',
        save: 'Сохранить',
    },
}
